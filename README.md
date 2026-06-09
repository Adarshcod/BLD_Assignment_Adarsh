<div align="center">

# Remote Browser

### Control a real browser from your browser.

<br />

<img src="https://img.shields.io/badge/Python-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
<img src="https://img.shields.io/badge/Next.js-React-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
<img src="https://img.shields.io/badge/Docker-Containers-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
<img src="https://img.shields.io/badge/Playwright-Chromium-45ba4b?style=for-the-badge&logo=playwright&logoColor=white" />

<br /><br />

A mini **TeamViewer for browsers**. Click a button, a Docker container spins up with a real Chrome browser inside it, and its screen streams back to you in real time. You can click, scroll, type, and navigate — all from your own browser tab.

</div>

---

## The Simple Explanation

Imagine you have a computer in a box. You can't touch it, but you have a magic window that shows you its screen, and whatever you do on the magic window — clicking, typing, scrolling — happens on that computer too.

That's exactly what this project does, except:
- The **"computer in a box"** is a Docker container running a Chrome browser
- The **"magic window"** is a web page you open on your machine
- The **"magic"** is WebSockets streaming screenshots at 10 frames per second

**You click "Start" → a container boots up with Chrome → you see its screen live → you control it remotely → you click "Stop" → the container is destroyed.**

---

## How It Works — Step by Step

```
  YOU (browser at localhost:3000)
   │
   │  1. Click "Start Browser"
   │
   ▼
  ORCHESTRATOR (port 8080)              ──── The Manager
   │
   │  2. Finds a free port (e.g. 37899)
   │  3. Runs: docker run remote-browser-agent
   │  4. Waits until the container is healthy
   │  5. Returns: "connect to ws://localhost:37899/ws"
   │
   ▼
  BROWSER AGENT (inside Docker)         ──── The Worker
   │
   │  6. Launches headless Chrome (Playwright)
   │  7. Opens google.com
   │  8. Starts screenshotting at ~10 FPS
   │
   ▼
  BACK TO YOU
   │
   │  9. Your browser connects via WebSocket
   │  10. Receives JPEG frames → draws on <canvas>
   │  11. You click/type → sent back over WebSocket
   │  12. Agent performs the action in Chrome
   │  13. Next screenshot shows the result
   │
   └── This loop runs until you click "Stop"
```

### The Core Loop (once connected)

```
Chrome renders a page
       ↓
Agent screenshots it as JPEG
       ↓
Encodes to base64, sends over WebSocket
       ↓
Frontend draws it on a <canvas>         ← You see a live browser!
       ↓
You click at (400, 250) on the canvas
       ↓
Frontend scales to 1280×720 → (640, 500)
       ↓
Sends { type: "click", x: 640, y: 500 }
       ↓
Agent calls Playwright: page.mouse.click(640, 500)
       ↓
Chrome processes the click
       ↓
Next screenshot captures the result     ← Repeat ~10x per second
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         YOUR MACHINE                               │
│                                                                    │
│  ┌──────────────┐      REST API       ┌──────────────────────┐    │
│  │   Frontend    │◄──────────────────►│    Orchestrator       │    │
│  │  (Next.js)    │ POST /sessions/start│   (FastAPI :8080)     │    │
│  │   :3000       │ DELETE /sessions/:id│                      │    │
│  │               │ GET /sessions       │   Uses Docker SDK    │    │
│  └───────┬───────┘                    └──────────┬───────────┘    │
│          │                                       │                 │
│          │ WebSocket                             │ docker run      │
│          │ ws://localhost:<port>/ws               │ docker stop     │
│          │                                       │                 │
│          │       ┌───────────────────────┐       │                 │
│          └──────►│   Browser Agent       │◄──────┘                 │
│                  │   (FastAPI :9000)     │  ← Docker Container     │
│                  │                       │                          │
│                  │  ┌─────────────────┐  │                          │
│                  │  │   Playwright    │  │                          │
│                  │  │   + Chromium    │  │                          │
│                  │  └─────────────────┘  │                          │
│                  └───────────────────────┘                          │
└────────────────────────────────────────────────────────────────────┘
```

**Three pieces, one job:**

| Piece | What it does | Analogy |
|-------|-------------|---------|
| **Frontend** | Shows the screen, captures your input | The TV + remote control |
| **Orchestrator** | Starts and stops containers on demand | The power switch |
| **Browser Agent** | Runs Chrome, streams screenshots, executes input | The actual computer |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | **Next.js 15**, React 19, TypeScript, Canvas API | Fast, modern, responsive UI with pixel-accurate rendering |
| Orchestrator | **Python 3.12**, FastAPI, Docker SDK | Lightweight API to manage container lifecycle |
| Browser Agent | **Python 3.12**, FastAPI, Playwright | Industry-standard browser automation with screenshot support |
| Containerization | **Docker**, Docker Compose | Isolate each browser session in its own container |
| Protocol | **WebSocket** with JSON + base64 JPEG | Bidirectional real-time communication |

---

## Getting Started

### Prerequisites

| Tool | Why you need it |
|------|----------------|
| **Docker Desktop** | Runs the containers (browser agent + orchestrator) |
| **Node.js 18+** | Runs the frontend |

### Setup (3 commands)

**Step 1 — Build the browser image** (one-time, takes ~2 min)

```bash
cd remote-browser
docker build -t remote-browser-agent ./browser_agent
```

This creates a Docker image with Chrome pre-installed inside it.

**Step 2 — Start the orchestrator**

```bash
docker-compose up --build
```

This starts the manager service on port 8080.

**Step 3 — Start the frontend** (in a new terminal)

```bash
cd frontend
npm install
npm run dev
```

**Step 4 — Open your browser**

Go to [http://localhost:3000](http://localhost:3000) and click **Start Browser**.

That's it. You should see a live Chrome browser streaming inside your web page.

---

## Using It

| Action | How |
|--------|-----|
| **Start a session** | Click the "Start Browser" button |
| **Click** | Click anywhere on the browser canvas |
| **Type** | Click the canvas first (to focus it), then type normally |
| **Scroll** | Use your mouse wheel / trackpad on the canvas |
| **Navigate** | Type a URL in the top bar and press Enter |
| **Go back / forward** | Use the arrow buttons in the toolbar |
| **Reload** | Click the reload button in the toolbar |
| **Stop** | Click the "Stop" button — container is destroyed |

---

## WebSocket Protocol

All communication between the frontend and browser agent happens over a single WebSocket connection.

### Server → Client (what you receive)

```json
// Screen frame (~10 per second)
{ "type": "frame", "data": "data:image/jpeg;base64,/9j/4AAQ..." }

// URL changed (after navigation)
{ "type": "url_update", "url": "https://www.google.com" }
```

### Client → Server (what you send)

```json
{ "type": "click", "x": 450, "y": 300 }
{ "type": "scroll", "deltaX": 0, "deltaY": 120 }
{ "type": "type", "text": "hello world" }
{ "type": "keydown", "key": "Enter" }
{ "type": "navigate", "url": "https://github.com" }
{ "type": "back" }
{ "type": "forward" }
{ "type": "reload" }
```

All coordinates are in **1280 x 720** space. The frontend automatically scales your mouse position from the displayed canvas size to this internal resolution.

---

## Project Structure

```
remote-browser/
│
├── docker-compose.yml              # Runs the orchestrator (mounts Docker socket)
├── .gitignore
├── README.md
│
├── orchestrator/                    # THE MANAGER
│   ├── main.py                     #   FastAPI — session CRUD + Docker SDK
│   ├── requirements.txt
│   └── Dockerfile
│
├── browser_agent/                   # THE WORKER (runs inside Docker)
│   ├── main.py                     #   FastAPI — Playwright + WebSocket streaming
│   ├── requirements.txt
│   └── Dockerfile
│
└── frontend/                        # THE UI
    ├── package.json
    ├── next.config.js
    ├── tsconfig.json
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── page.tsx                #   Main page — state management
        └── components/
            ├── Toolbar.tsx         #   Top bar — controls, URL bar, status
            └── BrowserViewer.tsx   #   Canvas + WebSocket + input handling
```

---

## How the Key Parts Work

### Container Orchestration (orchestrator/main.py)

The orchestrator manages browser containers through the Docker SDK:

- **Start:** Find a free port on the host → `docker run` the browser-agent image with that port mapped → poll the container's `/health` endpoint until it responds → return the WebSocket URL to the frontend
- **Stop:** `docker stop` the container → it auto-removes itself
- **Resource limits:** Each container is capped at **512 MB RAM** and **0.5 CPU cores** so one session can't take down the host

### Screen Streaming (browser_agent/main.py)

The browser agent runs an async loop at ~10 FPS:
1. Capture a screenshot via Playwright (`page.screenshot()`)
2. Encode it as JPEG at 65% quality (small size, fast transfer)
3. Base64-encode it and send it over WebSocket
4. Sleep for the remaining time in the frame interval

### Input Scaling (frontend/components/BrowserViewer.tsx)

The canvas displays at a responsive size on your screen, but the remote browser always runs at 1280x720. When you click:

```
Your click position on screen: (400, 250)
Canvas display size: (960, 540)
Internal resolution: (1280, 720)

Scaled X = (400 / 960) × 1280 = 533
Scaled Y = (250 / 540) × 720 = 333

Sent to agent: { type: "click", x: 533, y: 333 }
```

This ensures pixel-accurate input regardless of your window size.

---

## My Approach

I started by breaking the problem into three independent layers — the browser agent, the orchestrator, and the frontend — so each could be built and tested in isolation. The browser agent came first since it's the core: getting Playwright to stream screenshots over a WebSocket reliably was the hardest part. Once that worked, I built the orchestrator around Docker's Python SDK to handle container lifecycle, and finally wired up the React frontend with canvas rendering. I focused on getting the full end-to-end flow working before polishing anything, because a working demo beats a pretty half-finished one.

## What I'd Improve With More Time

The biggest upgrade would be switching from JPEG-over-WebSocket to WebRTC, which would cut latency dramatically and handle poor network conditions gracefully. I'd also add authentication so sessions are isolated per user, implement session timeouts to auto-kill idle containers, and add right-click and drag support for better browser interaction. On the frontend side, I'd show a remote cursor, add clipboard sync between host and container, and build a session history panel. Finally, I'd write proper integration tests that spin up a container and verify the full streaming pipeline automatically.

---

## Known Limitations

| Limitation | Why |
|-----------|-----|
| No audio | Only the visual output is streamed; Playwright doesn't capture audio |
| Single-click only | Double-click, right-click, and drag are not yet implemented |
| No clipboard sync | Can't copy/paste between your machine and the remote browser |
| Slight blur on text | JPEG compression trades sharpness for smaller frame sizes |
| No authentication | The API is open — in production you'd add auth middleware |
| HTTP only | No TLS — use a reverse proxy (nginx/Caddy) for HTTPS in production |

---

## Future Roadmap

- [ ] **WebRTC streaming** — lower latency, adaptive bitrate
- [ ] **Authentication** — per-user session isolation
- [ ] **Session timeouts** — auto-kill idle containers
- [ ] **Right-click + drag** — full mouse interaction support
- [ ] **Remote cursor** — show cursor position on the canvas
- [ ] **Clipboard sync** — copy/paste between host and container
- [ ] **Adaptive quality** — adjust JPEG quality based on network speed
- [ ] **Session recording** — replay sessions as video
- [ ] **Mobile touch support** — translate touch events for mobile

---

<div align="center">

**Built with Python, React, Docker, and Playwright**

</div>

