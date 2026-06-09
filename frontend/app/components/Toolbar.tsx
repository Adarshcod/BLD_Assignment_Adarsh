"use client";

import { FormEvent, useState } from "react";

type SessionStatus = "idle" | "starting" | "connected" | "error";

interface ToolbarProps {
  status: SessionStatus;
  fps: number;
  currentUrl: string;
  errorMsg: string;
  onStart: () => void;
  onStop: () => void;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
}

const STATUS_CONFIG: Record<SessionStatus, { color: string; label: string }> = {
  idle: { color: "var(--text-secondary)", label: "Idle" },
  starting: { color: "var(--warning)", label: "Starting" },
  connected: { color: "var(--success)", label: "Connected" },
  error: { color: "var(--error)", label: "Error" },
};

export default function Toolbar({
  status,
  fps,
  currentUrl,
  errorMsg,
  onStart,
  onStop,
  onNavigate,
  onBack,
  onForward,
  onReload,
}: ToolbarProps) {
  const [urlInput, setUrlInput] = useState("");
  const isConnected = status === "connected";
  const statusInfo = STATUS_CONFIG[status];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onNavigate(urlInput.trim());
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Top bar: branding + session controls */}
      <div style={styles.topBar}>
        <div style={styles.brand}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span style={styles.title}>Remote Browser</span>
        </div>

        <div style={styles.controls}>
          {/* Status indicator */}
          <div style={styles.statusBadge}>
            <span
              style={{
                ...styles.statusDot,
                backgroundColor: statusInfo.color,
                boxShadow: status === "connected" ? `0 0 6px ${statusInfo.color}` : "none",
              }}
            />
            <span style={{ color: statusInfo.color, fontSize: 13, fontWeight: 500 }}>
              {statusInfo.label}
            </span>
          </div>

          {/* FPS counter */}
          {isConnected && (
            <div style={styles.fpsBadge}>
              {fps} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>FPS</span>
            </div>
          )}

          {/* Start / Stop button */}
          {status === "idle" || status === "error" ? (
            <button style={styles.startBtn} onClick={onStart}>
              Start Browser
            </button>
          ) : status === "starting" ? (
            <button style={styles.disabledBtn} disabled>
              <span style={styles.spinner} /> Starting...
            </button>
          ) : (
            <button style={styles.stopBtn} onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Navigation bar — only visible when connected */}
      {isConnected && (
        <div style={styles.navBar}>
          <button style={styles.navBtn} onClick={onBack} title="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button style={styles.navBtn} onClick={onForward} title="Forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button style={styles.navBtn} onClick={onReload} title="Reload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          <form onSubmit={handleSubmit} style={styles.urlForm}>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={currentUrl || "Enter URL..."}
              style={styles.urlInput}
            />
          </form>
        </div>
      )}

      {/* Error message */}
      {status === "error" && errorMsg && (
        <div style={styles.errorBanner}>{errorMsg}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "var(--bg-tertiary)",
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  fpsBadge: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    padding: "4px 10px",
    background: "var(--bg-tertiary)",
    borderRadius: 20,
  },
  startBtn: {
    padding: "7px 18px",
    borderRadius: "var(--radius)",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    transition: "background 0.15s",
  },
  stopBtn: {
    padding: "7px 18px",
    borderRadius: "var(--radius)",
    background: "var(--error)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
  },
  disabledBtn: {
    padding: "7px 18px",
    borderRadius: "var(--radius)",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "not-allowed",
  },
  spinner: {
    display: "inline-block",
    width: 12,
    height: 12,
    border: "2px solid var(--text-secondary)",
    borderTopColor: "transparent",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  navBar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "0 16px 10px",
  },
  navBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 6,
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    transition: "background 0.15s, color 0.15s",
  },
  urlForm: {
    flex: 1,
    marginLeft: 8,
  },
  urlInput: {
    width: "100%",
    padding: "7px 14px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  },
  errorBanner: {
    padding: "6px 16px 10px",
    fontSize: 13,
    color: "var(--error)",
  },
};
