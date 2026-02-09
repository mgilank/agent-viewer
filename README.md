# Agent Viewer

A kanban board for managing multiple Claude Code agents running in tmux sessions. Spawn, monitor, and interact with agents from a single web UI.

<img width="1466" height="725" alt="Screenshot 2026-02-09 at 14 54 21" src="https://github.com/user-attachments/assets/cd31b988-f649-4e92-9844-7a1ece9aa634" />


## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [tmux](https://github.com/tmux/tmux)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude` command available in your PATH)

### Install prerequisites (macOS)

```bash
brew install node tmux
npm install -g @anthropic-ai/claude-code
```

## Setup

```bash
git clone <repo-url> && cd agent-viewer
npm install
```

## Usage

```bash
npm start
```

Open http://localhost:4200 in your browser.

### Configuration

| Variable | Default     | Description              |
|----------|-------------|--------------------------|
| `PORT`   | `4200`      | Server port              |
| `HOST`   | `localhost`  | Bind address (`0.0.0.0` for network access) |

Example:

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

## Features

- **Spawn agents** — Click `[+ SPAWN]` or press `N`, enter a project path and prompt. Each agent launches in its own tmux session running `claude`.
- **Kanban columns** — Agents are sorted into Running, Idle, and Completed columns based on their state.
- **Auto-discovery** — Existing tmux sessions running Claude are automatically detected and added to the board.
- **Live output** — Click `VIEW OUTPUT` to see the full terminal output with ANSI color rendering.
- **Send messages** — Type in the prompt field on any card and press `Ctrl+Enter` to send follow-up messages to an agent.
- **File uploads** — Drag and drop files onto a card or click `FILE` to send files to an agent.
- **Re-spawn** — Completed agents can be re-spawned with a new prompt from the same project directory.
- **Attach** — Click `ATTACH` to copy the `tmux attach` command for direct terminal access.
