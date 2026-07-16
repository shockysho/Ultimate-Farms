# AI Workspace Setup Guide

How to give your coding AI seamless access to your screen, browser, local files,
and any program on your machine — all from one workspace.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              YOUR LAPTOP SCREEN                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Terminal  │  │ Browser  │  │ Other Apps   │  │
│  │ (files,   │  │ (web     │  │ (Figma, DB   │  │
│  │  folders, │  │  research,│  │  clients,    │  │
│  │  git)     │  │  docs)   │  │  spreadsheets│  │
│  └─────┬────┘  └────┬─────┘  └──────┬───────┘  │
│        │             │               │           │
│  ┌─────┴─────────────┴───────────────┴─────┐    │
│  │         AI AGENT (Claude Code)           │    │
│  │                                          │    │
│  │  Files ← Claude Code CLI (built-in)      │    │
│  │  Browser ← MCP Browser Server            │    │
│  │  Screen ← Computer Use API               │    │
│  │  Terminal ← Claude Code CLI (built-in)    │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Option 1: MCP-Powered Workspace (Start Here)

MCP (Model Context Protocol) lets Claude Code talk to external tools
through standardized servers. No screen reading — direct programmatic
access to browsers, databases, APIs, etc.

### Step 1: Claude Code handles files + terminal (already done)

Claude Code already has:
- Full filesystem read/write access
- Bash shell for running any terminal command
- Git operations
- Project-wide search (grep, glob)

### Step 2: Add browser access via MCP

Install a browser MCP server so the AI can open pages, click, type,
and extract content from the web.

**Option A: Playwright MCP (recommended)**

```bash
# Install globally
npm install -g @anthropic-ai/mcp-server-playwright

# Or use npx (no install needed)
npx @anthropic-ai/mcp-server-playwright
```

Add to your Claude Code MCP config (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    }
  }
}
```

**Option B: Puppeteer MCP**

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

**What this gives you:**
- AI can navigate to any URL
- Fill out forms, click buttons
- Extract page content
- Take screenshots of pages
- Run JavaScript in browser console

### Step 3: Add filesystem MCP for expanded file access (optional)

If you want the AI to access files outside the current project:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/Documents",
        "/home/user/Downloads",
        "/home/user/Desktop"
      ]
    }
  }
}
```

### Step 4: Add other integrations as needed

| MCP Server | Purpose |
|---|---|
| `@modelcontextprotocol/server-postgres` | Direct database access |
| `@modelcontextprotocol/server-github` | GitHub issues, PRs, repos |
| `@modelcontextprotocol/server-slack` | Read/send Slack messages |
| `@modelcontextprotocol/server-google-maps` | Location/mapping data |
| `@modelcontextprotocol/server-memory` | Persistent AI memory |

### Full MCP Config Example

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user"
      ]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost:5432/ultimate_farms"
      }
    }
  }
}
```

---

## Option 2: Computer Use (Full Screen Reading)

Anthropic's Computer Use API gives the AI actual vision of your screen
plus mouse and keyboard control. It can operate ANY program — not just
ones with MCP servers.

### What Computer Use does

- **Sees your screen** as screenshots (pixel-level vision)
- **Moves mouse** to click buttons, menus, icons
- **Types on keyboard** into any application
- **Works with any program** — browser, terminal, Figma, Excel, anything

### How to set it up

**Option A: Anthropic's Computer Use Docker Container**

```bash
# Pull the reference container
docker pull ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo

# Run it (exposes a virtual desktop at localhost:8080)
docker run \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -p 5900:5900 \
  -p 8501:8501 \
  -p 6080:6080 \
  -p 8080:8080 \
  ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo
```

Then open `http://localhost:8080` — you get a virtual desktop that the
AI can see and control.

**Option B: Build a custom agent with the API**

```python
import anthropic

client = anthropic.Anthropic()

# The AI takes screenshots and sends mouse/keyboard actions
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=[
        {
            "type": "computer_20250124",
            "name": "computer",
            "display_width_px": 1920,
            "display_height_px": 1080,
            "display_number": 0,
        }
    ],
    messages=[
        {
            "role": "user",
            "content": "Open the browser and go to the Ultimate Farms GitHub repo"
        }
    ],
)
```

**Option C: Use an open-source Computer Use framework**

- **Open Interpreter** — runs locally, sees screen, executes code
- **Cline + Computer Use** — VS Code extension with screen vision

### Limitations of Computer Use

- Slower than MCP (takes screenshots, processes images)
- Uses more API tokens (images are expensive)
- Less precise than programmatic access
- Best for tasks that REQUIRE visual interaction

---

## Recommended Setup for Ultimate Farms

Given your project (Node.js/TypeScript backend, React PWA frontend,
PostgreSQL, offline-first), here is the practical setup:

### Day-to-day development: Claude Code + MCP

```
Claude Code CLI
├── Built-in: file editing, terminal, git
├── MCP: Playwright browser (test your PWA, research docs)
├── MCP: PostgreSQL (query your farm database directly)
└── MCP: GitHub (manage issues and PRs)
```

### When you need full screen access: Computer Use

Use Computer Use for:
- Testing the PWA on different screen sizes visually
- Interacting with third-party dashboards (MoMo, WhatsApp Cloud)
- Debugging visual layout issues
- Any task where the AI needs to SEE what the app looks like

---

## Quick Start Checklist

- [ ] Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- [ ] Create `.mcp.json` in project root with browser + DB servers
- [ ] Test browser MCP: ask Claude to "open localhost:3000 and describe what you see"
- [ ] Test DB MCP: ask Claude to "show me the flock_master table schema"
- [ ] (Optional) Set up Computer Use Docker container for visual tasks
- [ ] (Optional) Add filesystem MCP for cross-project file access

---

## Security Notes

- MCP servers run locally — your data stays on your machine
- Computer Use operates in a sandboxed container by default
- Database MCP should use a read-only connection for safety
- Never commit API keys — use environment variables
- Browser MCP can access authenticated sessions — be careful with cookies
