---
description: Every section of the Modelibr Settings page - appearance, uploads, thumbnails, texture proxy, Blender, certificates, WebDAV, backups, MCP and desktop options.
sidebar_position: 19
---

# Settings

The **Settings** tab is where the app is configured. Most sections apply to the
whole instance; a few are browser-only preferences, and one appears only in the
native desktop host. Sections that hold a form (File Upload, Thumbnail
Generation, Texture Proxy) share a **Save** / **Discard** footer; the rest save
as soon as you change them.

## Appearance

Browser-only display preferences, kept in this browser.

| Option                    | What it does                                   | Default |
| ------------------------- | ---------------------------------------------- | ------- |
| **Color theme**           | Switches between **Light** and **Dark**         | Light   |
| **Mobile tab bar position** | Places the tab bar **Left**, **Bottom** or **Top** | Left |
| **Pinned tabs**           | Chooses which pages stay pinned in the main dock | Models and Projects |

The pinned-tab catalogue is **Models**, **Global Materials**, **VFX**,
**Scenes** and **Projects**. There is no density control. These preferences are
never sent to the server, and no environment variable changes them.

## File Upload

| Option                       | What it does                                                        | Default |
| ---------------------------- | ------------------------------------------------------------------- | ------- |
| **Maximum file size (MB)**   | Per-file limit for model uploads (1 to 10240)                       | 1024    |
| **Maximum thumbnail size (MB)** | Per-file limit for an uploaded thumbnail (1 to 100)              | 10      |
| **Duplicate name policy**    | **Allow duplicates**, **Reject duplicate names**, or **Auto-rename** (`Chair (2)`) | Allow |
| **Auto-tag on import**       | Suggest a category and tags from the file name and folder           | On      |

Auto-tagging only ever suggests; everything it applies is reviewable. No
environment variable overrides these.

## Thumbnail Generation

| Option                         | What it does                                                     | Default |
| ------------------------------ | ---------------------------------------------------------------- | ------- |
| **Generate thumbnail on upload** | Render a preview when a model is uploaded                       | On      |
| **Animated thumbnail**         | Render a multi-frame orbiting loop instead of one static frame   | On      |
| **Frame count**                | Frames in the loop (1 to 360), shown while animated              | 30      |
| **Thumbnail size (px)**        | 64, 128, 256, 512, 1024 or 2048 px                               | 256     |
| **Reuse duplicate thumbnails** | Reuse an existing thumbnail when the same file is uploaded again | Off     |
| **Thumbnail background**       | **Transparent**, or a solid colour                               | Transparent |
| **Regenerate All Thumbnails**  | Queues a re-render for every model, applying the current settings | -      |

`SKIP_DUPLICATE_THUMBNAILS` in `.env` is a **fallback only**: once you set the
toggle in the app, the stored value wins. The worker's `RENDER_WIDTH` and
`RENDER_HEIGHT` are likewise only a fallback - the worker reads the live
thumbnail size from the app.

## Texture Proxy

| Option                  | What it does                                        | Default |
| ----------------------- | --------------------------------------------------- | ------- |
| **Web proxy resolution** | 256, 512, 1024 or 2048 px; proxies regenerate on the next texture-set processing | 512 |

No environment variable overrides this.

## Blender

Blender is optional. This section installs and manages one Blender CLI version
at a time; **Install**, **Switch** and **Uninstall** manage it, and a separate
run is bounded by **Operation timeout (minutes)** (1 to 240, default 15).

Two environment variables are relevant:

- `BLENDER_OPERATION_TIMEOUT_MS` is a **fallback** used only until a timeout is
  stored in the app.
- `BLENDER_INSTALL_PATH` overrides where Blender is installed. On the native
  host this is set to the managed folder inside your data directory.

There is no remote Blender library setting.

## SSL Certificate

Downloads the instance's self-signed certificate as
`modelibr-selfsigned.crt`, with per-OS steps for trusting it. Trusting it stops
the browser warning and is required for Windows WebDAV over HTTPS. Nothing here
is persisted, and the download URL comes from the configured WebDAV ports. See
[Troubleshooting](/docs/features/troubleshooting) if the warning reappears.

## WebDAV

Shows the WebDAV URLs this instance exposes, each as `<url>/modelibr`, with a
reachability probe that reports the folder count or the error, plus **How to map
as a network drive** instructions for your OS. Nothing is configurable here:
the ports and protocols come from `WEBDAV_HTTP_PORT` and `WEBDAV_HTTPS_PORT` in
`.env`. Removing those variables disables the matching port. HTTP is preferred
for local networks. See [WebDAV](/docs/features/webdav).

## Script Templates

Create and edit your own script templates, or **Duplicate** a built-in one as a
starting point. A template has a **Name**, a **Language**, an optional
**Description** and its **Content**. Templates are stored on the server, not as
a key-value setting, and no environment variable changes them. See
[Scripts](/docs/features/scripts).

## Backup & Restore

| Option                          | What it does                                                     | Default |
| ------------------------------- | ---------------------------------------------------------------- | ------- |
| **Back up before updates**      | Take an automatic database backup before applying migrations     | On      |
| **Pre-update backups to keep**  | How many `pre-migration-*` snapshots to keep (1 to 10)           | 3       |
| **Keep recycled files for (days)** | Permanently delete recycled items older than this (0 to 365); 0 keeps them until you delete them | 0 |
| **Create backup**               | Database and uploaded files are always included; **thumbnails are optional** | Off |
| Backup list                     | **Download**, **Restore** or **Delete** each archive             | -       |

A restore is staged now and applied on the **next restart**, which keeps the
path crash-safe.

In the Docker stack, `MODELIBR_SKIP_PREMIGRATION_BACKUP` and
`MODELIBR_PREMIGRATION_BACKUP_RETENTION` are always set, and an explicitly set
environment variable **wins over the stored setting**. On a native install they
are not set, so the stored values apply. See [Backups & Restore](/docs/features/backups).

## MCP explorer

The three toggles are described as taking effect after restart:

| Option                    | What it does                                          | Default | Environment variable  |
| ------------------------- | ----------------------------------------------------- | ------- | --------------------- |
| **MCP server**            | Serve the `/mcp` endpoint at all                      | On      | `MCP_ENABLED`         |
| **Allow write tools**     | Expose the tools that change the library              | Off     | `MCP_WRITE_ENABLED`   |
| **Allow destructive tools** | Let an agent delete (recycle) assets and undo destructive writes | Off | `MCP_DESTRUCTIVE_ENABLED` |

Below the toggles, the section lists the **agents** and their tools, with a
**Search tools** filter and a **Filter by agent** select (**All tools** or
**Used by no agent**), and the path to connect a client.

Each environment variable **wins over its stored toggle** when explicitly set -
and the Docker Compose file always sets all three. `MCP_TOKENS` (per-token
scoping) has no UI; it is `.env`-only. See
[Agent server (MCP)](/docs/features/mcp-server).

## Desktop

This section appears only when the native desktop host is answering; in a Docker
or browser deployment it is not shown.

| Option                          | What it does                                            | Default |
| ------------------------------- | ------------------------------------------------------- | ------- |
| **Start on login**              | Launch Modelibr when you sign in to this computer        | Off     |
| **Download updates automatically** | Download updates in the background when available; installing stays your choice | Off |

Both apply live and are stored by the host. They have no environment override.
See [Desktop app](/docs/features/desktop).
