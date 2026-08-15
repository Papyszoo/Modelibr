---
sidebar_position: 14
---

# Agent server (MCP)

Modelibr ships a local [Model Context Protocol](https://modelcontextprotocol.io)
server so an AI agent - Claude Code, the Claude desktop app, or an IDE
extension - can search your asset library and pick the right asset for a task.
Ask "find me a low-poly medieval prop with no animations" and the agent queries
the same full-text + fuzzy search the app uses, then reads the deterministic
metadata Modelibr extracts for each asset.

The server is **local-first**: it runs inside your own Modelibr instance, never
calls a hosted service, and works fully offline. It is **read-only by default** -
the tools that change anything only appear when you opt in with
`MCP_WRITE_ENABLED=true`.

## What the agent can read

These five tools are always available, each a thin wrapper over an ordinary
Modelibr API endpoint - there is no separate search or extraction path:

| Tool                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_assets`     | Full-text + fuzzy-identifier search with structural filters - triangle/vertex/part counts, size (bounding-box dimension), rig (`hasRig`/bone count), materials, UVs, animations, shape class, engine, asset type, and **category**. Every query word is scored on its own, so a document matching more of them ranks higher, and plurals find their singular. Conceptual queries (`weapon`, `vehicle`, `building`) hit via deterministic concept labels, ranked below assets whose author actually named them that. Leave the query blank to browse by filters alone. Returns one ranked hit **per asset** (current version only), each carrying a short browse summary **and its structural facts** - triangles, size, parts, materials, UVs, rig, animations - so an agent can compare candidates without a follow-up call per hit. |
| `get_asset`         | The derived metadata and part list for an asset's current version, plus `suggestedCategories` (deterministic concept-label suggestions the user/agent can confirm-assign).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `get_part`          | A single part's detail, addressed by its part-path (e.g. `/Building/Roof`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `compute_on_demand` | A cached expensive metric (UV overlap, texel density, surface area, …) keyed by geometry hash, or `pending` if it has not been computed yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `list_facets`       | The structural filters `search_assets` accepts and their value ranges (including size, rig, materials, UVs, part counts, and category), so the agent can compose filters without guessing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## What the agent can change (opt-in)

Set `MCP_WRITE_ENABLED=true` in your root `.env` and sixteen more tools appear,
letting an agent curate the library the way you would in the app. They are a thin
pass-through over the same command handlers the UI uses, so there is one source
of truth for what a change means:

| Tool               | What it does                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_tags`         | Replace a model's tags (and optionally its description), preserving its category.                                                                                                       |
| `set_category`     | Assign or clear a model's category without touching tags.                                                                                                                               |
| `create_pack`      | Create a pack (a curated collection).                                                                                                                                                   |
| `add_to_pack`      | Add a model to a pack.                                                                                                                                                                  |
| `trigger_rederive` | Queue a re-extraction so parts, derived signals and the search index are rebuilt.                                                                                                       |
| `import_model`     | Import a model. Pass a `path` the **server** can read for a co-located import; omit `path` to get an upload ticket plus the HTTP endpoints to stream bytes to when the agent is remote. |

The rest of the library is reachable too, so an agent can build a scene that has
materials and audio and not only meshes. Each takes a path the **server** can read:

| Tool                     | What it does                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `import_sound`           | Import a sound. Duration and waveform peaks are measured by the asset processor afterwards, so you do not supply them.                                                   |
| `import_sprite`          | Import a sprite - `Static`, `SpriteSheet`, `Gif` or `Apng`.                                                                                                              |
| `import_environment_map` | Import an HDRI or equirectangular environment map, optionally labelled with its resolution.                                                                              |
| `import_texture_set`     | Import a whole material in one call: pass every channel file (albedo, normal, roughness, …) and they land in a single texture set.                                       |
| `add_texture_channel`    | Add one more channel file to an existing texture set.                                                                                                                    |
| `bind_texture_set`       | Bind a texture set to a model so it renders with it - associates the set with every version of the model and makes it the default. One call for what the UI does in two. |
| `request_upload_ticket`  | For an agent that is **not** on the server: a single-use ticket plus the exact endpoint and field names for uploading any asset family over HTTP.                        |

Three rules make these safe to retry, review and undo:

- **Every write takes an `idempotencyKey`.** The key is claimed before anything is
  applied, and the claim records whether the write actually landed. Repeating a call
  therefore gets one of three honest answers: `already-applied` (it completed - here is
  the recorded result), `in-progress` (another call holds the key right now; nothing has
  been applied yet, retry), or the write simply runs, because the previous attempt
  failed or its caller died. A crashed import run can be restarted without either
  double-applying a write or losing one to a key that was burned by a failure.
- **Every write is audited.** Modelibr records the operation, target, payload and - when
  tokens are configured - which agent identity performed it, so "what did the agent
  change?" stays answerable.
- **Every write can be undone.** Pass the same `batchId` to a run of related calls and
  `reverse_operation` puts the whole batch back in one call. See below.

### Undo, and deleting

| Tool                | What it does                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reverse_operation` | Undo one write by its `idempotencyKey`, or a whole `batchId`, newest first. Restores replaced tags, categories and materials; recycles assets an agent imported. |
| `delete_asset`      | Recycle a model, sound, sprite, environment map or texture set - a **soft** delete, restorable from the recycle bin.                                             |
| `restore_asset`     | Bring a recycled asset back.                                                                                                                                     |

`reverse_operation` and `delete_asset` **default to a dry run**: they report exactly what
would happen and change nothing until you pass `dryRun=false`. Anything that deletes also
needs `MCP_DESTRUCTIVE_ENABLED=true` on the server, and the `destructive` scope if you use
tokens.

Undo is honest about its limits. A write whose prior state was never recorded, or an
operation with no meaningful inverse (re-derivation computes fresh data - there is nothing
lost to restore), is reported as un-reversible rather than being counted as undone.

### Uploading from an agent that is not on the server

When the agent and the server are on different machines, the agent cannot hand a tool a
path the server can read. Call `import_model` without a `path` (or
`request_upload_ticket` for any other family) and you get a **single-use upload ticket**
plus the endpoint and its exact field names. Send the ticket back as the
`X-Modelibr-Upload-Ticket` header on the upload, and that upload is audited and
de-duplicated under your `idempotencyKey` just like a co-located import - a retry of an
upload that already landed is answered `already-applied` instead of importing a second
copy. Tickets expire after 30 minutes; an upload the server rejects hands the ticket back
so you can fix the request and retry.

The server also publishes an `import_library` **prompt** - a guided playbook for
ingesting a whole folder of models into a categorized pack (dedupe, prefer `.glb`,
handle multi-file `.gltf`, then categorize from the suggestions).

## Connecting an agent

The server is enabled by default and hosted in-process by the Modelibr Web API
over HTTP (SSE) at the `/mcp` path. With the default configuration that is:

```
https://localhost:8443/mcp
```

(`8443` is `HTTPS_PORT` from your root `.env` - use whatever port you publish the
Web API on.)

Point your agent at that URL. For Claude Code, add it as an SSE MCP server:

```bash
claude mcp add --transport sse modelibr https://localhost:8443/mcp
```

Other clients (Claude desktop, IDE extensions) take the same URL in their MCP
server settings. Once connected, the tools above appear to the agent.

## Configuration

| Setting                   | Default | Effect                                                                                                                    |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `MCP_ENABLED`             | `true`  | Set to `false` in your root `.env` to disable the MCP endpoint entirely.                                                  |
| `MCP_WRITE_ENABLED`       | `false` | Set to `true` to also expose the write tools and the `import_library` prompt. Restart the Web API.                        |
| `MCP_DESTRUCTIVE_ENABLED` | `false` | Set to `true` to let the agent delete (recycle) assets and reverse writes that deleting undoes. Dry runs work either way. |
| `MCP_TOKENS`              | (unset) | Per-token access scoping - see below. Unset means the endpoint is unauthenticated, as the rest of Modelibr is.            |

The MCP endpoint shares the Web API's network exposure - enabling it does **not**
widen what is reachable from off your machine. Keep the Web API bound to localhost
(or behind your existing reverse proxy) if you do not want other devices on your
network to reach it.

### Scoping what a token may do

Modelibr has no user accounts by design, and `MCP_TOKENS` does not add any. It is a
capability gate on the agent surface alone: without it, any client that can reach the
endpoint can use every tool the endpoint exposes. Configure it before letting anything
beyond your own machine reach `/mcp`.

```bash
MCP_TOKENS=curator:read,write:GENERATE_A_LONG_RANDOM_SECRET;janitor:read,write,destructive:ANOTHER_SECRET
```

Each entry is `name:scopes:secret`, separated by `;`. Scopes are `read` (search and
read assets), `write` (import, tag, categorize, pack, bind) and `destructive` (delete,
and undoing a write that deleting undoes). `write` implies `read`.

Once any token is configured, a caller must present one - as
`Authorization: Bearer <secret>`, or as an `X-Modelibr-Mcp-Token` header for clients that
cannot set `Authorization`. The token's **name** is recorded on everything it writes, so
the audit log answers "which agent did this?" and not only "an agent did this". Secrets
are held hashed and compared in constant time; a malformed `MCP_TOKENS` fails startup
rather than silently leaving the endpoint open. Revoke a token by removing its entry and
restarting the Web API.

## Notes

- Uploaded script assets are treated as **data**, never executed. The agent reads
  parsed metadata (language, detected engine, flagged sensitive APIs), not runnable
  code.
- Every agent query is recorded in Modelibr's search log, the same as searches
  from the app, so "did the agent find good assets?" stays answerable.
