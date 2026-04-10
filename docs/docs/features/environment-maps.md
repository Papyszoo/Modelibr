---
sidebar_position: 10
---

# Environment Maps

Environment Maps let you store panoramic lighting assets alongside your other library items. They are designed for HDRI-style skies, reflections, and scene lighting references, with generated previews so you can scan them visually before opening the full panorama.

:::note Video placeholder
A dedicated Environment Maps walkthrough video will be added later.
:::

## Uploading Environment Maps

Open the **Environment Maps** tab and upload one or more files.

**Supported formats:** common image formats, HDR, EXR

Each upload creates an environment map with an initial size-labelled variant. Batch uploads also appear in upload history, so larger import sessions are easier to review.

## Variants and Preview Sizes

Each environment map can contain multiple size variants, such as `1K`, `2K`, or other size labels used by your pipeline.

The detail viewer lets you:

- open the panoramic asset in a dedicated tab
- switch between available preview sizes
- inspect the currently selected panorama preview
- open the selected image in a separate browser tab

Modelibr uses the existing file preview pipeline for environment maps, so image/HDR/EXR-style files can participate in the same preview flow used elsewhere in the library.

## Packs and Projects

Environment maps are first-class assets, so they can be added to:

- **Packs** for reusable lighting libraries
- **Projects** for scene-specific or level-specific lighting collections

When you open a pack or project, environment maps appear in their own asset section alongside models, texture sets, sprites, and sounds.

## Recycled Files

Deleting an environment map moves it to **Recycled Files** instead of removing it immediately. This gives you the same restore or permanent-delete workflow used by the rest of the library.

## WebDAV

WebDAV exposes environment maps in three places:

- `/EnvironmentMaps`
- `/Packs/{PackName}/EnvironmentMaps`
- `/Projects/{ProjectName}/EnvironmentMaps`

Inside each environment map folder, WebDAV exposes both:

- **Variants** — size-labelled files such as `1K.hdr`
- **Files** — original uploaded filenames
