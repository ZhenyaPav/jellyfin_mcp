# Jellyfin MCP Server

MCP server (stdio) for controlling Jellyfin via HTTP API, compatible with Node.js 18.

## Features

Implemented tools:

1. `jellyfin_browse`
2. `jellyfin_get_recommendations`
3. `jellyfin_play_by_name`
4. `jellyfin_playback_control`

Includes smart session auto-discovery for playback tools when `sessionId` is omitted.

Tool outputs are intentionally compact and default-capped to `20` items per call.

For "play breaking bad"-style requests, use `jellyfin_play_by_name` to search and start playback in one tool call.

## Requirements

1. Node.js 18+
2. Jellyfin server URL
3. Jellyfin API key

## Environment Variables

Required:

- `JELLYFIN_API_URL` (example: `http://192.168.1.50:8096`)
- `JELLYFIN_API_KEY`

Optional:

- `JELLYFIN_USER_ID`
- `JELLYFIN_SESSION_STRATEGY` (`active`, `recent`, `device`, `ask`; default `active`)
- `JELLYFIN_DEVICE_ID_HINT` (preferred device id/name match)
- `JELLYFIN_TIMEOUT_MS` (default `15000`)

Note:

- If your key is a server API key (not a user auth token), `/Users/Me` may return `400`.
- The server handles this by falling back to `/Users` and auto-selecting the single user when only one exists.
- If multiple users exist, set `JELLYFIN_USER_ID` explicitly.

## Install

```bash
npm install
```

## Test

```bash
npm test
```

## Run

```bash
JELLYFIN_API_URL=http://YOUR_JELLYFIN_HOST:8096 \
JELLYFIN_API_KEY=YOUR_API_KEY \
node src/index.js
```

## MCP Client Config (No `cwd`)

Use absolute script path so client `cwd` behavior does not matter.

Claude Desktop-style:

```json
{
  "mcpServers": {
    "jellyfin": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/jellyfin_mcp/src/index.js"
      ],
      "env": {
        "JELLYFIN_API_URL": "http://YOUR_JELLYFIN_HOST:8096",
        "JELLYFIN_API_KEY": "YOUR_API_KEY",
        "JELLYFIN_SESSION_STRATEGY": "active"
      }
    }
  }
}
```

Generic MCP config:

```json
{
  "servers": {
    "jellyfin": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/jellyfin_mcp/src/index.js"
      ],
      "env": {
        "JELLYFIN_API_URL": "http://YOUR_JELLYFIN_HOST:8096",
        "JELLYFIN_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Additional planning notes remain in `docs/IMPLEMENTATION_PLAN.md`.
