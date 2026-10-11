---
description: Recover deleted models, texture sets, environment maps, sprites, sounds, and scripts from the recycle bin. Identical files are deduplicated automatically.
sidebar_position: 6
---

# Recycled Files

The Recycle Bin provides a safety net for deleted items, allowing you to recover accidentally deleted models, versions, texture sets, environment maps, sprites, sounds, and scripts.

<div className="feature-video-container">
  <video
    controls
    width="100%"
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    poster="/img/videos/recycled-files-poster.webp"
  >
    <source src="/videos/recycled-files.webm" type="video/webm" />
    <p className="video-fallback">A short screen recording of recycling and restoring assets in Modelibr</p>
  </video>
</div>

## Accessing the Recycle Bin

Open the **Recycled Files** tab from the New Tab page.

![The Modelibr recycle bin listing deleted assets that can be restored](/img/screenshots/recycled-files.png)

## What Can Be Recycled?

| Item Type          | What Happens                           |
| ------------------ | -------------------------------------- |
| **Models**         | All versions move to recycle bin       |
| **Model Versions** | Single version recycled, model remains |
| **Texture Sets**   | Unlinked from all models               |
| **Environment Maps** | Entire environment map recycled with its panorama/cube variants |
| **Environment Map Variants** | Single size variant recycled, environment map remains |
| **Sprites**        | Removed from sprite sheets             |
| **Sounds**         | Sound entry recycled with its audio file |
| **Scripts**        | Script recycled with its source file   |

## Restoring Items

1. Open the Recycled Files panel
2. Find the item you want to restore
3. Right-click and select **Restore**

The item returns to its original location.

## Permanent Deletion

To permanently delete an item:

1. Open the Recycled Files panel
2. Right-click the item
3. Select **Delete Permanently**

:::danger Permanent deletion cannot be undone
Once permanently deleted, the item and its associated files are removed from the database. However, shared files that are still used by other items are protected.

For environment maps, this means unused variant files and custom-thumbnail files are deleted only when nothing else still references them.
:::

## Automatic retention

By default, recycled items are kept until you delete them permanently. You can
choose a retention in **Settings → Backup & Restore → Keep recycled files for
(days)**: once a day, items recycled longer ago than that are permanently
deleted through the same path as **Delete Permanently**. `0` (the default)
means nothing is ever purged automatically.

Automatic cleanup never removes files that a live asset still references,
even when their recycled entry ages out.

## Shared File Protection

Modelibr uses file deduplication - identical files are stored only once. This means:

- If two models use the same file, deleting one doesn't affect the other
- Permanent deletion only removes files that aren't used elsewhere
- You'll see a warning if attempting to delete shared files
