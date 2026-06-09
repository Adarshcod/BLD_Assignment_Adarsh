"""
Browser Agent — runs inside a Docker container.

Manages a headless Chromium instance via Playwright and exposes:
  - GET  /health          → readiness probe for the orchestrator
  - WS   /ws              → bidirectional WebSocket for screen streaming + input

Screen frames are captured as JPEG screenshots at ~10 FPS and sent to the
client as base64-encoded data URIs. Input events (click, scroll, type,
keydown, navigate, back, forward, reload) arrive on the same WebSocket and
are forwarded into the Playwright page.
"""

import asyncio
import base64
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from playwright.async_api import async_playwright, Browser, Page

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("browser-agent")

# ---------------------------------------------------------------------------
# Global state – one browser per container, one page per WebSocket session
# ---------------------------------------------------------------------------
_playwright = None
_browser: Browser | None = None

VIEWPORT = {"width": 1280, "height": 720}
TARGET_FPS = 10
FRAME_INTERVAL = 1.0 / TARGET_FPS
JPEG_QUALITY = 65


async def _launch_browser() -> Browser:
    """Launch headless Chromium with container-safe flags."""
    global _playwright, _browser
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--single-process",
        ],
    )
    logger.info("Chromium launched")
    return _browser


async def _shutdown_browser():
    global _playwright, _browser
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None
    logger.info("Chromium shut down")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await _launch_browser()
    yield
    await _shutdown_browser()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# WebSocket handler
# ---------------------------------------------------------------------------

async def _stream_frames(ws: WebSocket, page: Page, stop_event: asyncio.Event):
    """Continuously capture and send JPEG screenshots until stopped."""
    while not stop_event.is_set():
        loop_start = time.monotonic()
        try:
            screenshot = await page.screenshot(type="jpeg", quality=JPEG_QUALITY)
            b64 = base64.b64encode(screenshot).decode("ascii")
            await ws.send_json({
                "type": "frame",
                "data": f"data:image/jpeg;base64,{b64}",
            })
        except Exception as exc:
            if stop_event.is_set():
                break
            logger.warning("Frame capture error: %s", exc)

        elapsed = time.monotonic() - loop_start
        sleep_time = max(0, FRAME_INTERVAL - elapsed)
        await asyncio.sleep(sleep_time)


async def _send_url_update(ws: WebSocket, page: Page):
    """Send the current URL to the client."""
    try:
        await ws.send_json({"type": "url_update", "url": page.url})
    except Exception:
        pass


async def _handle_input(ws: WebSocket, page: Page, stop_event: asyncio.Event):
    """Receive and process input events from the client."""
    while not stop_event.is_set():
        try:
            raw = await ws.receive_text()
        except WebSocketDisconnect:
            stop_event.set()
            return

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from client: %s", raw[:200])
            continue

        event_type = msg.get("type")
        try:
            if event_type == "click":
                await page.mouse.click(float(msg["x"]), float(msg["y"]))

            elif event_type == "scroll":
                # Move the mouse to a reasonable center, then scroll
                await page.mouse.wheel(
                    float(msg.get("deltaX", 0)),
                    float(msg.get("deltaY", 0)),
                )

            elif event_type == "type":
                await page.keyboard.type(msg["text"])

            elif event_type == "keydown":
                await page.keyboard.press(msg["key"])

            elif event_type == "navigate":
                url = msg["url"]
                if not url.startswith(("http://", "https://")):
                    url = "https://" + url
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                await _send_url_update(ws, page)

            elif event_type == "back":
                await page.go_back(wait_until="domcontentloaded", timeout=10000)
                await _send_url_update(ws, page)

            elif event_type == "forward":
                await page.go_forward(wait_until="domcontentloaded", timeout=10000)
                await _send_url_update(ws, page)

            elif event_type == "reload":
                await page.reload(wait_until="domcontentloaded", timeout=10000)
                await _send_url_update(ws, page)

            else:
                logger.warning("Unknown event type: %s", event_type)

        except Exception as exc:
            logger.error("Error handling '%s' event: %s", event_type, exc)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("WebSocket client connected")

    if _browser is None:
        await ws.close(code=1011, reason="Browser not ready")
        return

    # Each WebSocket session gets its own browser context + page
    context = await _browser.new_context(viewport=VIEWPORT)
    page = await context.new_page()
    await page.goto("https://www.google.com", wait_until="domcontentloaded")
    logger.info("New page opened at google.com")

    await _send_url_update(ws, page)

    stop_event = asyncio.Event()
    frame_task = asyncio.create_task(_stream_frames(ws, page, stop_event))

    try:
        await _handle_input(ws, page, stop_event)
    finally:
        stop_event.set()
        frame_task.cancel()
        try:
            await frame_task
        except asyncio.CancelledError:
            pass
        await context.close()
        logger.info("WebSocket session cleaned up")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
