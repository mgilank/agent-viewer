# Agent Viewer

> **A visual kanban board for orchestrating multiple Claude Code agents**  
> Spawn, monitor, and interact with AI coding assistants from a single web UI. Manage your autonomous development team through tmux sessions with real-time state tracking and intelligent auto-discovery.

<img width="1466" height="725" alt="Agent Viewer Dashboard" src="https://github.com/user-attachments/assets/cd31b988-f649-4e92-9844-7a1ece9aa634" />

---

## Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📱 Remote Access](#-remote-access)
- [🎯 Usage Guide](#-usage-guide)
- [🏗️ Architecture](#️-architecture)
- [⚙️ Configuration](#️-configuration)
- [🔧 Development](#-development)
- [🐛 Troubleshooting](#-troubleshooting)
- [📚 API Reference](#-api-reference)

---

## ✨ Features

### Core Capabilities

- **🚀 Agent Spawning** — Create new Claude Code agents with custom prompts and project paths
- **📊 Kanban Board** — Visual organization across Running, Idle, and Completed columns
- **🔄 Real-time State Detection** — Automatic state tracking via intelligent terminal output parsing
- **🔍 Auto-Discovery** — Automatically detects existing Claude tmux sessions and adds them to the board
- **💬 Interactive Messaging** — Send follow-up messages and files to running agents
- **📁 Smart Project Management** — Save frequently-used projects as tabs for quick access

### Advanced Features

- **🎨 ANSI Color Support** — Full 16/256/24-bit color rendering in terminal output
- **📤 File Uploads** — Drag-and-drop or click to send files to agents
- **🔄 Re-spawn** — Restart completed agents with new prompts in the same project
- **🔗 Direct Attachment** — Copy tmux attach commands for terminal access
- **🌐 Mobile-Friendly** — Access and manage agents from your phone via Tailscale
- **🧠 AI-Generated Labels** — Automatic label generation using Claude Haiku for better organization
- **📦 Persistent Registry** — Agent state persists across server restarts

### Keyboard Shortcuts

- **`N`** — Open spawn modal
- **`Enter`** — Send message (in prompt field)
- **`Shift+Enter`** — New line (in prompt field)

---

## 🚀 Quick Start

### Prerequisites

You'll need the following installed on your system:

- **[Node.js](https://nodejs.org/)** v18 or higher
- **[tmux](https://github.com/tmux/tmux)** for session management
- **[Claude CLI](https://docs.anthropic.com/en/docs/claude-code)** (`claude` command in PATH)

#### macOS Installation

```bash
# Install dependencies via Homebrew
brew install node tmux

# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code
```

#### Verify Installation

```bash
node --version    # Should be v18+
tmux -V           # Should show tmux version
claude --version  # Should show Claude CLI version
```

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd agent-viewer

# Install dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:4200** in your browser.

---

## 📱 Remote Access

Access Agent Viewer from any device on your network using [Tailscale](https://tailscale.com/).

### Setup Tailscale

1. **Install on your Mac**
   ```bash
   brew install tailscale
   # Or download from https://tailscale.com/download
   ```

2. **Install on your phone**  
   - [iOS App Store](https://apps.apple.com/app/tailscale/id1470499037)
   - [Android Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn)

3. **Sign in** with the same account on both devices

### Access from Your Phone

```bash
# Start the server (binds to 0.0.0.0 by default)
npm start
```

Get your Tailscale IP:
```bash
tailscale ip
```

Then visit on your phone:
```
http://<tailscale-ip>:4200
```

**With MagicDNS** (if enabled):
```
http://<machine-name>:4200
```

![Mobile View](https://github.com/user-attachments/assets/c7298d61-dd37-4d0f-8b0a-d9d1f0231782)

---

## 🎯 Usage Guide

### Spawning Agents

1. Click **`[+ SPAWN]`** or press **`N`**
2. Enter the **project path** (or browse with 📁)
3. Write your **initial prompt**
4. Click **`SPAWN`**

The agent launches in a new tmux session and appears on the board.

### Managing Agents

| Action | Description |
|--------|-------------|
| **VIEW OUTPUT** | Open full terminal output with ANSI colors |
| **EXPAND** | Show output inline on the card |
| **Send Message** | Type in prompt field and press Enter |
| **FILE** | Upload a file to the agent |
| **ATTACH** | Copy tmux attach command |
| **RESPAWN** | Restart a completed agent with new prompt |
| **CLEANUP** | Remove agent from board |
| **KILL** | Terminate running agent session |

### Project Tabs

- Click **`+`** to save the current project as a tab
- Click a tab to filter by that project
- When a tab is selected, spawn modal auto-fills that project path

### Folder Browser

Click the **📁** button in the spawn modal to visually browse your filesystem and select project directories.

### Auto-Discovery

Agent Viewer automatically discovers existing tmux sessions running Claude Code and adds them to the board. No manual registration needed!

---

## 🏗️ Architecture

Agent Viewer is a **minimal, framework-free application** with a clean two-file architecture:

```
agent-viewer/
├── server.js              # Express backend (tmux integration, SSE broadcasting)
├── public/
│   ├── index.html         # Frontend (HTML/CSS/JS in one file)
│   ├── prompt-key-utils.js
│   └── expanded-card-utils.js
├── .agent-registry.json   # Persistent agent state
└── .project-tabs.json     # Saved project tabs
```

### Backend (`server.js`)

**Core Systems:**

- **Agent Registry** — In-memory state + JSON persistence
- **State Detection** — Polls tmux output every 3s to classify agent states
- **Tmux Integration** — Spawns sessions, captures output, sends input
- **Auto-Discovery** — Scans tmux sessions and detects Claude processes
- **LLM Label Generation** — Async Claude Haiku calls for smart labeling
- **SSE Broadcasting** — Real-time state updates to all clients

**State Detection Logic:**

Agents are classified by pattern-matching terminal output:
- **Running** — "esc to interrupt" prompt visible
- **Idle** — Empty prompt or permission requests
- **Completed** — Session exited or specific completion signals

### Frontend (`public/index.html`)

- **Vanilla JavaScript** — No frameworks, no build step
- **SSE-Driven Updates** — Real-time state synchronization
- **ANSI Converter** — Full 16/256/24-bit color support
- **Drag-and-Drop** — For card reordering and file uploads
- **Terminal Aesthetic** — Dark, modern UI inspired by CLI tools

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4200` | Server port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` for network access, `127.0.0.1` for localhost only) |
| `POLL_INTERVAL` | `3000` | State detection interval in milliseconds |

### Examples

**Custom port:**
```bash
PORT=3000 npm start
```

**Localhost only:**
```bash
HOST=127.0.0.1 npm start
```

**Multiple settings:**
```bash
HOST=0.0.0.0 PORT=8080 POLL_INTERVAL=5000 npm start
```

---

## 🔧 Development

### Project Structure

```
agent-viewer/
├── server.js              # Main backend (Express + tmux integration)
├── public/
│   ├── index.html         # Complete frontend app
│   ├── prompt-key-utils.js       # Keyboard handling utilities
│   └── expanded-card-utils.js    # Card state management
├── test/
│   └── ansi-test.html     # ANSI color rendering tests
├── docs/
│   └── architecture.html  # Visual architecture diagram
├── .agent-registry.json   # Auto-generated agent state
├── .project-tabs.json     # Auto-generated saved tabs
├── CLAUDE.md             # Claude Code integration guide
└── package.json
```

### No Build Step

This project runs directly with Node.js:
- No transpilation
- No bundling
- No compilation

Just edit and refresh!

### Key Patterns

- **Shell escaping** — Single quotes: `message.replace(/'/g, "'\\''")`
- **Async commands** — All external commands use `exec()` with timeouts (never `execSync()`)
- **Session naming** — Format: `agent-{label}` (lowercase, hyphenated)
- **Manual parsing** — Multipart file uploads parsed without libraries
- **Interactive handling** — `waitForClaudeReady()` auto-dismisses Claude startup prompts

---

## 🐛 Troubleshooting

### Common Issues

#### Agent not spawning

**Problem:** Agent doesn't appear on the board after clicking SPAWN

**Solutions:**
- Verify `claude` is in your PATH: `which claude`
- Check tmux is installed: `tmux -V`
- Ensure project path exists and is accessible
- Check server logs for errors

#### Output not showing

**Problem:** Terminal output is blank or not updating

**Solutions:**
- Wait 3 seconds for next state detection cycle
- Check if tmux session exists: `tmux ls`
- Try clicking `VIEW OUTPUT` instead of `EXPAND`
- Verify agent is actually running: `tmux attach -t agent-<label>`

#### Agents not auto-discovered

**Problem:** Existing Claude tmux sessions not appearing

**Solutions:**
- Ensure tmux session contains a Claude process
- Restart the server to trigger fresh discovery
- Check `.agent-registry.json` for corrupted data

#### Cannot connect from phone

**Problem:** Tailscale IP not accessible

**Solutions:**
- Verify server started with `HOST=0.0.0.0`
- Check Tailscale is running on both devices: `tailscale status`
- Use IP address instead of MagicDNS name
- Ensure no firewall blocking port 4200

### Debug Mode

Enable verbose logging:

```bash
DEBUG=* npm start
```

View tmux sessions:
```bash
tmux ls
```

Attach to agent directly:
```bash
tmux attach -t agent-<label>
```

---

## 📚 API Reference

### REST Endpoints

#### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List all agents with current state |
| `POST` | `/api/agents` | Spawn new agent |
| `POST` | `/api/agents/:name/send` | Send message or respawn |
| `POST` | `/api/agents/:name/upload` | Upload file to agent |
| `DELETE` | `/api/agents/:name` | Kill agent session |
| `DELETE` | `/api/agents/:name/cleanup` | Remove from registry |
| `GET` | `/api/agents/:name/output` | Fetch terminal output |

#### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/recent-projects` | List recently used paths |
| `GET` | `/api/browse?dir=PATH` | Browse directories |

#### Bulk Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `DELETE` | `/api/cleanup/completed` | Bulk cleanup completed agents |

#### Real-time

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events` | SSE stream for real-time updates |

### Request Examples

**Spawn Agent:**
```bash
curl -X POST http://localhost:4200/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "prompt": "Implement user authentication"
  }'
```

**Send Message:**
```bash
curl -X POST http://localhost:4200/api/agents/my-agent/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Add unit tests"}'
```

**Upload File:**
```bash
curl -X POST http://localhost:4200/api/agents/my-agent/upload \
  -F "files=@./config.json"
```

---

## 📄 License

See repository for license information.

---

## 🤝 Contributing

Contributions are welcome! This is a minimal project by design:
- Keep it simple
- No frameworks or build tools
- Maintain the single-file frontend approach

---

## 🙏 Acknowledgments

Built with:
- [Express](https://expressjs.com/) — Web framework
- [tmux](https://github.com/tmux/tmux) — Terminal multiplexer
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — AI coding assistant

---

**Made with ❤️ for developers managing multiple AI agents**
