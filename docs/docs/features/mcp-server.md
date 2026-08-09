---
sidebar_position: 13
---

# Agent search (MCP server)

Modelibr ships a local [Model Context Protocol](https://modelcontextprotocol.io)
server so an AI agent — Claude Code, the Claude desktop app, or an IDE
extension — can search your asset library and pick the right asset for a task.
Ask "find me a low-poly medieval prop with no animations" and the agent queries
the same full-text + fuzzy search the app uses, then reads the deterministic
metadata Modelibr extracts for each asset.

The server is **local-first and read-only**: it runs inside your own Modelibr
instance, never calls a hosted service, and works fully offline. It cannot modify
or delete anything — it only searches and reads.

## What the agent can do

The server exposes five read-only tools, each a thin wrapper over an ordinary
Modelibr API endpoint — there is no separate search or extraction path:

| Tool                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_assets`     | Full-text + fuzzy-identifier search with structural filters — triangle/vertex/part counts, size (bounding-box dimension), rig (`hasRig`/bone count), materials, UVs, animations, shape class, engine, asset type, and **category**. Conceptual queries (`weapon`, `animal`, `building`) also hit via deterministic concept labels folded into the index. Returns ranked, current-version-only hits, each with a short browse summary. |
| `get_asset`         | The derived metadata and part list for an asset's current version, plus `suggestedCategories` (deterministic concept-label suggestions the user/agent can confirm-assign).                                                                                                                                                                                                                                                            |
| `get_part`          | A single part's detail, addressed by its part-path (e.g. `/Building/Roof`).                                                                                                                                                                                                                                                                                                                                                           |
| `compute_on_demand` | A cached expensive metric (UV overlap, texel density, surface area, …) keyed by geometry hash, or `pending` if it has not been computed yet.                                                                                                                                                                                                                                                                                          |
| `list_facets`       | The structural filters `search_assets` accepts and their value ranges (including size, rig, materials, UVs, part counts, and category), so the agent can compose filters without guessing.                                                                                                                                                                                                                                            |

## Connecting an agent

The server is enabled by default and hosted in-process by the Modelibr Web API
over HTTP (SSE) at the `/mcp` path. With the default configuration that is:

```
https://localhost:8443/mcp
```

(`8443` is `HTTPS_PORT` from your root `.env` — use whatever port you publish the
Web API on.)

Point your agent at that URL. For Claude Code, add it as an SSE MCP server:

```bash
claude mcp add --transport sse modelibr https://localhost:8443/mcp
```

Other clients (Claude desktop, IDE extensions) take the same URL in their MCP
server settings. Once connected, the five tools above appear to the agent.

## Configuration

| Setting       | Default | Effect                                                                   |
| ------------- | ------- | ------------------------------------------------------------------------ |
| `MCP_ENABLED` | `true`  | Set to `false` in your root `.env` to disable the MCP endpoint entirely. |

The MCP endpoint shares the Web API's network exposure and authentication —
enabling it does **not** widen what is reachable from off your machine. Keep the
Web API bound to localhost (or behind your existing reverse proxy) if you do not
want other devices on your network to reach it.

## Notes

- Uploaded script assets are treated as **data**, never executed. The agent reads
  parsed metadata (language, detected engine, flagged sensitive APIs), not runnable
  code.
- Every agent query is recorded in Modelibr's search log, the same as searches
  from the app, so "did the agent find good assets?" stays answerable.
