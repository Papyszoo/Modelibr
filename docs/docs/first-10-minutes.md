---
description: A first session with Modelibr - install, import models, browse and tag them, open the viewer, build a pack, import from the Store, and connect an AI agent.
sidebar_position: 2
---

# Your First 10 Minutes

This is the shortest path from "Modelibr is running" to a small, usable library.
It assumes you have already installed Modelibr - if not, start with the
[Getting Started](/docs) guide, then come back here. Everything below is done in
the browser window the app opens at.

## 1. Open the app

- **Native installer**: open the frontend URL from the host's **Show Status**
  window, which is `http://127.0.0.1:3010` by default.
- **Docker**: open [https://localhost:3010](https://localhost:3010). Your
  browser warns once about the self-signed certificate; accept it to continue.

Either way you land on the **New Tab** page, a launcher for every part of the
app. See [User Interface](/docs/features/user-interface) for how tabs and panes
work.

## 2. Import a few models

Open **Models** and drag a handful of files onto the grid, or use the folder and
`.zip` import buttons for loose `.gltf` files that reference external buffers and
textures.

**Supported formats:** GLB, GLTF, FBX, OBJ, STL, 3MF, Blend.

![The Modelibr library grid showing uploaded 3D models with tags, versions, and categories](/img/screenshots/model-list.png)

Each file becomes its own model. Modelibr indexes it right away and the worker
renders a thumbnail in the background, so the card fills in its picture a moment
later. A model also classifies itself from its name and folder where it can; a
strip above the grid offers to **Review** what it guessed. See
[Model Management](/docs/features/models) for import, versions and the review
queue.

## 3. Organize and find

- Right-click the category sidebar to add a category, then drag model cards onto
  it.
- Open a model and add tags from its header; the input suggests tags other
  models already use.
- Press **Ctrl/⌘ + K** anywhere to open Global Search and find an asset by name
  across the library.

Tags and categories are the fastest way to keep a growing library navigable.
They are also what an AI agent searches against later, so a little naming goes a
long way.

## 4. Look at a model

Click a model card to open the **Model Viewer**. Drag with the left mouse button
to rotate, the right button to pan, scroll to zoom, and double-click to reset.

![The Modelibr model viewer showing a 3D model in the browser with the version list beside it](/img/screenshots/model-viewer.png)

The floating buttons cover version history, metadata, textures, the hierarchy and
thumbnails. See [Model Management](/docs/features/models) for the full control
list, and [Animations and Shape Keys](/docs/features/animations) if the model
carries clips.

## 5. Build a pack

Open **Packs** from the New Tab page (Organize group), click **Create New Pack**,
give it a name, then open the pack and use **Add** in each asset section to pull
in models, textures, sounds and more. Packs are reusable bundles you can drop
into any project. See [Packs](/docs/features/packs).

## 6. Visit the Store

Open the **Asset Store** tab to sign in with your store account and import packs
into your library with one click. The store is an online surface: if it is
unreachable, that page shows a single quiet status and nothing else in the app is
affected. Free packs can be imported without an account; paid packs need your
own store session. See [Asset Store](/docs/features/asset-store).

## 7. Connect an AI agent

Modelibr ships a local [MCP](https://modelcontextprotocol.io) server, so an
agent can search your library and read the metadata Modelibr extracts. It is
**read-only by default** and works fully offline.

- **Docker**: `https://localhost:8443/mcp` (the port is `HTTPS_PORT` in `.env`).
- **Native installer**: `http://127.0.0.1:3010/api/mcp`.

For Claude Code:

```bash
claude mcp add --transport sse modelibr https://localhost:8443/mcp
```

Turning on the write tools is a deliberate opt-in with
`MCP_WRITE_ENABLED=true`. The [Agent server (MCP)](/docs/features/mcp-server)
page covers the full tool list, tokens and safe writes.

## Where to go next

- [Scenes](/docs/features/scenes) - place library assets into a composition
- [VFX](/docs/features/vfx) - layer particles, meshes, lights and sounds
- [Materials](/docs/features/materials) - parameter materials and tiling sets
- [Settings](/docs/features/settings) - every option, and its default
- [Desktop app](/docs/features/desktop) - the native host and its client
- [Troubleshooting](/docs/features/troubleshooting) - when something will not start
