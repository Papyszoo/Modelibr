---
description: Fix common Modelibr problems - a port in use, the certificate warning, Blender not installed, missing thumbnails, an unreachable Store, and WebDAV.
sidebar_position: 21
---

# Troubleshooting

Most problems with a self-hosted app come down to a port, a certificate, or a
background service. This page covers the ones you are most likely to hit, and
what the app already tells you.

## A port is already in use

**Native host.** If the saved app port is taken, the host starts on a free one
and the status window shows **"A saved port was in use, so Modelibr is running on
a free one."** Your saved preference is left as-is and tried again next launch.
If nothing can bind at all, the host reports that the port is in use and asks you
to change it in **Settings** and restart.

To pick a different port, open the host's status window, expand **Settings**,
change **App port**, and click **Apply** - then **Restart to apply**. The
external and internal ports (App, Backend, Database) are all editable there.

**Docker.** The published ports come from your `.env`: `FRONTEND_PORT` (default
`3010`), `HTTPS_PORT` (default `8443`), and `WEBDAV_HTTP_PORT` /
`WEBDAV_HTTPS_PORT`. If one is already taken, change it in `.env` and run
`docker compose up -d` to recreate the stack on the new port.

## The browser shows a certificate warning

This is expected. Modelibr serves HTTPS with a **self-signed certificate**, so a
browser warns the first time.

- **Docker**: the certificate is generated into `./data/certs` and served by the
  web server, which also exposes it for download at `/modelibr-cert.crt`.
- **Native with network access on**: the host generates its own certificate for
  the `https://` LAN address.

To stop the warning, open **Settings -> SSL Certificate** and click **Download
SSL certificate**, then trust it:

- **Windows**: double-click, **Install Certificate**, **Local Machine**,
  **Trusted Root Certification Authorities**.
- **macOS**: double-click, open in **Keychain Access**, set to **Always Trust**.
- **Firefox**: Settings, **Privacy & Security**, **Certificates**, **View
  Certificates...**, **Authorities**, then import the file.

Once trusted, the warning stops, and Windows Explorer can reach the library at
`\\<hostname>@SSL\modelibr`. If the native host's network address changes, it
generates a fresh certificate and the warning returns until you trust the new
one.

## Blender is not installed, or a Blender operation fails

Blender is **optional** and the host does not look for one you already have.
Operations that need it - unwrapping, baking textures, converting formats,
measuring meshes, and the **Bake for web** button - stay unavailable until you
install it.

Open **Settings -> Blender** and use **Install** to set up a version. Only one is
managed at a time, so **Switch** or **Uninstall** first to change it. If a run
takes too long and is killed, raise **Operation timeout (minutes)**.

In Docker, `BLENDER_INSTALL_PATH` decides where Blender is installed; on the
native host it lives inside your data folder.

## Thumbnails are not appearing

A missing thumbnail usually means the worker has not rendered it yet, or a
setting is holding it back.

- Check **Settings -> Thumbnail Generation**: **Generate thumbnail on upload**
  should be on, and the size and frame count valid. **Reuse duplicate
  thumbnails**, when on, deliberately skips a re-render for a file it has seen
  before.
- Click **Regenerate All Thumbnails** to queue a fresh render for every model.
- The rendering is done by the asset processor. In the native status window its
  state is the **Preview generator** row under **Show details**; in Docker it is
  the `asset-processor` service (`docker compose logs asset-processor`).
- After a restore from a backup that did not include thumbnails, every missing
  thumbnail is queued for generation again once the app is running.

## The Store is unreachable or offline

The **Asset Store** tab is an online surface. If the store is down or you are
offline, the tab shows a single **Store unavailable** status, and your local
assets are unaffected - nothing else in the app depends on it.

There is nothing to configure: the store address is built in. The MCP store
tools report an unreachable store with their own code rather than an empty
catalog, so "the store is down" and "the store has no chairs" stay different
answers. See [Asset Store](/docs/features/asset-store).

## WebDAV will not mount

- **Is a port exposed?** WebDAV ports come from `WEBDAV_HTTP_PORT` and
  `WEBDAV_HTTPS_PORT` in `.env`; removing one disables that port. **Settings ->
  WebDAV** lists the URLs this instance exposes and probes each one for
  reachability - a folder count means it is up, an error means it is not.
- **Choose the right address for your OS.** HTTP is preferred for local networks
  because it needs no certificate. On Windows, `\\<host>\modelibr` resolves over
  HTTP on port **80** by default; use port **443** for HTTPS compatibility.
- **For HTTPS, trust the certificate first** (see above). After that,
  `\\<hostname>@SSL\modelibr` works in Windows Explorer.
- **Reaching it from another machine** needs the host to be reachable on the
  network - the native host's **Allow access from my network** toggle, or the
  Docker port mappings. On the native host, WebDAV is on the same local port as
  the app.

Open the **How to map as a network drive** instructions in **Settings -> WebDAV**
for the step-by-step per OS. See [WebDAV](/docs/features/webdav).
