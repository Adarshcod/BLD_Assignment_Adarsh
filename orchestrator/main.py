"""
Orchestrator — runs on the HOST machine.

Uses the Docker Python SDK to spin up / tear down browser-agent containers on
demand.  Each session maps a free host port to the container's internal port
9000 so the frontend can connect directly via WebSocket.

Endpoints:
  POST   /sessions/start   → start a new browser container, return session info
  DELETE /sessions/{id}     → stop and remove a session's container
  GET    /sessions          → list active sessions
"""

import asyncio
import logging
import os
import socket
import time
import uuid
from contextlib import closing
from typing import Dict

import docker
import httpx
from docker.errors import NotFound as DockerNotFound
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("orchestrator")

BROWSER_AGENT_IMAGE = "remote-browser-agent"
CONTAINER_PORT = 9000
HEALTH_TIMEOUT = 45  # seconds to wait for container readiness
HEALTH_POLL_INTERVAL = 0.5

# When running inside Docker, we need to use the container's IP for health
# checks (localhost won't reach the host-mapped port). The frontend, however,
# always connects via the host-mapped port.
RUNNING_IN_DOCKER = os.path.exists("/.dockerenv")

app = FastAPI(title="Remote Browser Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

class Session(BaseModel):
    session_id: str
    container_id: str
    host_port: int
    ws_url: str
    status: str  # "running" | "stopped"
    created_at: float


_sessions: Dict[str, Session] = {}


def _get_docker_client() -> docker.DockerClient:
    """Return a Docker client connected to the local daemon."""
    try:
        client = docker.from_env()
        client.ping()
        return client
    except Exception as exc:
        logger.error("Cannot connect to Docker: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Docker daemon is not reachable. Is Docker running?",
        )


def _find_free_port() -> int:
    """Find a free TCP port on the host by binding to port 0."""
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def _get_container_ip(container) -> str | None:
    """Get the container's IP on the bridge network for internal health checks."""
    container.reload()
    networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
    for net_name, net_info in networks.items():
        ip = net_info.get("IPAddress")
        if ip:
            logger.info("Container IP on '%s': %s", net_name, ip)
            return ip
    return None


async def _wait_for_health(container, host_port: int) -> bool:
    """Poll the container's /health endpoint until it responds 200.

    When the orchestrator itself runs inside Docker, localhost:{host_port}
    doesn't work — we use the container's bridge IP instead.
    """
    if RUNNING_IN_DOCKER:
        container_ip = _get_container_ip(container)
        if container_ip:
            url = f"http://{container_ip}:{CONTAINER_PORT}/health"
        else:
            # Fallback: try host.docker.internal (works on Docker Desktop)
            url = f"http://host.docker.internal:{host_port}/health"
    else:
        url = f"http://localhost:{host_port}/health"

    logger.info("Health-check URL: %s", url)
    deadline = time.monotonic() + HEALTH_TIMEOUT

    async with httpx.AsyncClient() as client:
        while time.monotonic() < deadline:
            try:
                resp = await client.get(url, timeout=2)
                if resp.status_code == 200:
                    return True
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout):
                pass
            await asyncio.sleep(HEALTH_POLL_INTERVAL)
    return False


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.post("/sessions/start")
async def start_session():
    """Spin up a new browser-agent container and return connection details."""
    client = _get_docker_client()
    session_id = uuid.uuid4().hex[:12]
    host_port = _find_free_port()

    logger.info(
        "Starting session %s — mapping host port %d → container %d",
        session_id, host_port, CONTAINER_PORT,
    )

    try:
        container = client.containers.run(
            image=BROWSER_AGENT_IMAGE,
            name=f"browser-session-{session_id}",
            ports={f"{CONTAINER_PORT}/tcp": host_port},
            detach=True,
            # Limit resource usage per container
            mem_limit="512m",
            cpu_period=100000,
            cpu_quota=50000,  # 0.5 CPU
            # Auto-remove when stopped
            remove=True,
        )
    except Exception as exc:
        logger.error("Failed to start container: %s", exc)
        raise HTTPException(status_code=500, detail=f"Container start failed: {exc}")

    logger.info("Container %s started, waiting for health check…", container.short_id)

    healthy = await _wait_for_health(container, host_port)
    if not healthy:
        logger.error("Container %s failed health check — removing", container.short_id)
        try:
            container.stop(timeout=5)
        except Exception:
            try:
                container.kill()
            except Exception:
                pass
        raise HTTPException(
            status_code=500,
            detail="Browser agent did not become healthy in time",
        )

    ws_url = f"ws://localhost:{host_port}/ws"
    session = Session(
        session_id=session_id,
        container_id=container.id,
        host_port=host_port,
        ws_url=ws_url,
        status="running",
        created_at=time.time(),
    )
    _sessions[session_id] = session
    logger.info("Session %s ready — ws_url: %s", session_id, ws_url)

    return {
        "session_id": session_id,
        "host_port": host_port,
        "ws_url": ws_url,
    }


@app.delete("/sessions/{session_id}")
async def stop_session(session_id: str):
    """Stop and remove a browser-agent container."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    client = _get_docker_client()
    try:
        container = client.containers.get(session.container_id)
        container.stop(timeout=5)
        logger.info("Session %s stopped", session_id)
    except DockerNotFound:
        logger.warning("Container for session %s already gone", session_id)
    except Exception as exc:
        logger.error("Error stopping session %s: %s", session_id, exc)

    session.status = "stopped"
    del _sessions[session_id]

    return {"session_id": session_id, "status": "stopped"}


@app.get("/sessions")
async def list_sessions():
    """List all active sessions."""
    return {"sessions": list(_sessions.values())}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
