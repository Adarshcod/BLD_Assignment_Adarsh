"use client";

import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

type SessionStatus = "idle" | "starting" | "connected" | "error";

// Internal resolution the browser agent captures at
const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

interface BrowserViewerProps {
  status: SessionStatus;
  wsUrl: string | null;
  errorMsg: string;
  wsRef: MutableRefObject<WebSocket | null>;
  onUrlUpdate: (url: string) => void;
  onFpsUpdate: (fps: number) => void;
  onDisconnect: () => void;
}

export default function BrowserViewer({
  status,
  wsUrl,
  errorMsg,
  wsRef,
  onUrlUpdate,
  onFpsUpdate,
  onDisconnect,
}: BrowserViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameCountRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: VIEWPORT_W, height: VIEWPORT_H });

  // -----------------------------------------------------------------------
  // Responsive canvas sizing — maintain 16:9 aspect ratio
  // -----------------------------------------------------------------------
  const updateCanvasSize = useCallback(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth - 32; // padding
    const containerH = containerRef.current.clientHeight - 32;
    const aspect = VIEWPORT_W / VIEWPORT_H;

    let w = containerW;
    let h = w / aspect;
    if (h > containerH) {
      h = containerH;
      w = h * aspect;
    }
    setCanvasSize({ width: Math.floor(w), height: Math.floor(h) });
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [updateCanvasSize]);

  // -----------------------------------------------------------------------
  // WebSocket connection + frame rendering
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let alive = true;

    ws.onopen = () => {
      console.log("[WS] connected");
    };

    ws.onmessage = (event) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "frame") {
          frameCountRef.current++;
          const img = new Image();
          img.onload = () => {
            const ctx = canvasRef.current?.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, VIEWPORT_W, VIEWPORT_H);
            }
          };
          img.src = msg.data;
        } else if (msg.type === "url_update") {
          onUrlUpdate(msg.url);
        }
      } catch (err) {
        console.warn("[WS] failed to parse message", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] disconnected");
      if (alive) onDisconnect();
    };

    ws.onerror = (err) => {
      console.error("[WS] error", err);
    };

    // FPS counter — sample every second
    const fpsInterval = setInterval(() => {
      onFpsUpdate(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      alive = false;
      clearInterval(fpsInterval);
      ws.close();
      wsRef.current = null;
    };
  }, [wsUrl, wsRef, onUrlUpdate, onFpsUpdate, onDisconnect]);

  // Auto-focus the canvas wrapper so keyboard events are captured immediately
  useEffect(() => {
    if (status === "connected") {
      wrapperRef.current?.focus();
    }
  }, [status]);

  // -----------------------------------------------------------------------
  // Input event helpers
  // -----------------------------------------------------------------------
  const scaleCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // Map display coordinates → internal 1280x720 space
      const x = ((clientX - rect.left) / rect.width) * VIEWPORT_W;
      const y = ((clientY - rect.top) / rect.height) * VIEWPORT_H;
      return { x: Math.round(x), y: Math.round(y) };
    },
    [],
  );

  const send = useCallback(
    (data: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    },
    [wsRef],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = scaleCoords(e.clientX, e.clientY);
      send({ type: "click", x, y });
    },
    [scaleCoords, send],
  );

  const handleScroll = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      send({ type: "scroll", deltaX: e.deltaX, deltaY: e.deltaY });
    },
    [send],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Don't intercept browser shortcuts (Ctrl/Cmd combos) unless it's common text editing
      if (e.metaKey || (e.ctrlKey && !["a", "c", "v", "x", "z"].includes(e.key.toLowerCase()))) {
        return;
      }
      e.preventDefault();

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        send({ type: "type", text: e.key });
      } else {
        // Map common key names to Playwright-compatible names
        send({ type: "keydown", key: e.key });
      }
    },
    [send],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const isConnected = status === "connected";

  return (
    <div ref={containerRef} style={styles.container}>
      {status === "idle" && (
        <div style={styles.placeholder}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--bg-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <p style={styles.placeholderText}>
            Click <strong>Start Browser</strong> to launch a remote session
          </p>
        </div>
      )}

      {status === "starting" && (
        <div style={styles.placeholder}>
          <div style={styles.spinnerLarge} />
          <p style={styles.placeholderText}>Spinning up container...</p>
        </div>
      )}

      {status === "error" && (
        <div style={styles.placeholder}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p style={{ ...styles.placeholderText, color: "var(--error)" }}>
            {errorMsg || "Connection lost"}
          </p>
          <p style={{ ...styles.placeholderText, fontSize: 13, marginTop: 4 }}>
            Click <strong>Start Browser</strong> to try again
          </p>
        </div>
      )}

      {isConnected && (
        <div
          ref={wrapperRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={styles.canvasWrapper}
        >
          <canvas
            ref={canvasRef}
            width={VIEWPORT_W}
            height={VIEWPORT_H}
            onClick={handleClick}
            onWheel={handleScroll}
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              cursor: "default",
              outline: "none",
              borderRadius: 6,
              boxShadow: "0 2px 24px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      )}

      {/* CSS animations injected via style tag */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 16,
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    opacity: 0.7,
  },
  placeholderText: {
    fontSize: 15,
    color: "var(--text-secondary)",
    textAlign: "center" as const,
  },
  canvasWrapper: {
    outline: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerLarge: {
    width: 40,
    height: 40,
    border: "3px solid var(--border)",
    borderTopColor: "var(--accent)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
