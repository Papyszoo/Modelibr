---
sidebar_position: 10
---

# Environment Maps

Environment Maps are first-class assets for HDRI lighting, reflections, and sky backgrounds. You can upload single panoramas or six-face cube maps, keep multiple size variants, pick which variant drives the main preview, and reuse the asset in packs and projects like the rest of the library.

:::note Video placeholder
A dedicated Environment Maps walkthrough video will be added later.
:::

## Environment Maps List

Open the **Environment Maps** tab to browse all lighting assets in their own library page.

The list page includes the same model-style toolbar behavior used elsewhere in the app:

- **Search**
- **Filters** for source type, projection type, and whether a custom thumbnail is set
- **Card width** control
- **Upload**
- **Refresh**

Cards show the current preview image, source type, variant count, and last updated date. Click a card to open the full environment map viewer.

## Uploading Environment Maps

1. Open **Environment Maps**
2. Click **Upload** or drag files onto the page
3. Choose **Panorama** or **Cube Faces**
4. Enter a name and optional size label such as `1K`, `2K`, or `4K`
5. If you choose cube upload, assign all six faces: `px`, `nx`, `py`, `ny`, `pz`, `nz`
6. Optionally add a **Custom Thumbnail**
7. Click **Upload**

**Supported formats:** common image formats, `.hdr`, `.exr`

Each upload creates one environment map with its first variant already attached. Cube uploads require all six face files.

## Viewer, Variants, and Preview Selection

Open any environment map card to use the dedicated viewer.

From there you can:

- inspect the selected source in a lit **Three.js** preview scene
- switch the active preview from the **Preview size** dropdown
- use **Available previews** buttons to jump between variants quickly
- open the selected source file in a separate browser tab
- click **Add Variant** to upload another panorama or another six-face cube variant

This makes it practical to keep `1K`, `2K`, `4K`, or pipeline-specific variants together under one asset instead of uploading separate entries.

## Thumbnails

Environment maps get generated previews automatically, but you can also override the card image with a custom thumbnail.

- Add a custom thumbnail during upload
- Upload or clear it later from the viewer
- Filter the list to show only environment maps that have custom thumbnails

If no custom thumbnail is set, Modelibr uses the currently selected preview variant.

## Packs and Projects

Environment maps are first-class assets, so they can be added to:

- **Packs** for reusable lighting libraries
- **Projects** for scene-specific or level-specific lighting collections

When you open a pack or project, environment maps appear in their own asset section alongside models, texture sets, sprites, and sounds.

## Recycled Files

Deleting an environment map moves the whole asset to **Recycled Files** instead of removing it immediately. That includes its uploaded variants and preview setup, so you can restore it later or delete it permanently when you are sure you no longer need it.

## WebDAV

WebDAV exposes environment maps in three places:

- `/EnvironmentMaps`
- `/Packs/{PackName}/EnvironmentMaps`
- `/Projects/{ProjectName}/EnvironmentMaps`

Inside each environment map folder, WebDAV exposes both:

- **Variants** — normalized size-labelled files such as `1K.hdr` for panoramas or `2K_px.hdr` through `2K_nz.hdr` for cube faces
- **Files** — the original uploaded filenames

## Demo Mode

The live demo supports environment maps too, including list browsing, panorama and cube uploads, thumbnail handling, and the dedicated viewer workflow.
