"use client";

import { useCallback, useRef, useState } from "react";
import Toolbar from "./components/Toolbar";
import BrowserViewer from "./components/BrowserViewer";

const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8080";

type SessionStatus = "idle" | "starting" | "connected" | "error";

export default function Home() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [fps, setFps] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const handleStart = useCallback(async () => {
    setStatus("starting");
    setErrorMsg("");
    try {
      const resp = await fetch(`${ORCHESTRATOR_URL}/sessions/start`, { method: "POST" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(body.detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setSessionId(data.session_id);
      setWsUrl(data.ws_url);
      setStatus("connected");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start session";
      setErrorMsg(message);
      setStatus("error");
    }
  }, []);

  const handleStop = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (sessionId) {
      try {
        await fetch(`${ORCHESTRATOR_URL}/sessions/${sessionId}`, { method: "DELETE" });
      } catch {
        // Best effort — container might already be gone
      }
    }
    setSessionId(null);
    setWsUrl(null);
    setCurrentUrl("");
    setFps(0);
    setStatus("idle");
  }, [sessionId]);

  const handleDisconnect = useCallback(() => {
    setStatus("error");
    setErrorMsg("WebSocket disconnected");
    setWsUrl(null);
    setFps(0);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Toolbar
        status={status}
        fps={fps}
        currentUrl={currentUrl}
        errorMsg={errorMsg}
        onStart={handleStart}
        onStop={handleStop}
        onNavigate={(url) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "navigate", url }));
          }
        }}
        onBack={() => {
          if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "back" }));
        }}
        onForward={() => {
          if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "forward" }));
        }}
        onReload={() => {
          if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "reload" }));
        }}
      />

      <BrowserViewer
        status={status}
        wsUrl={wsUrl}
        errorMsg={errorMsg}
        wsRef={wsRef}
        onUrlUpdate={setCurrentUrl}
        onFpsUpdate={setFps}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}
