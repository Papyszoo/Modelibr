---
sidebar_position: 3
---

# Recycled Files

The Recycle Bin provides a safety net for deleted items, allowing you to recover accidentally deleted models, versions, texture sets, and sprites.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/Modelibr/videos/recycled-files.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Accessing the Recycle Bin

Navigate to the **Recycled Files** tab in the left panel.

![Recycled Files](/img/screenshots/recycled-files.png)

## What Can Be Recycled?

| Item Type          | What Happens                           |
| ------------------ | -------------------------------------- |
| **Models**         | All versions move to recycle bin       |
| **Model Versions** | Single version recycled, model remains |
| **Texture Sets**   | Unlinked from all models               |
| **Sprites**        | Removed from sprite sheets             |

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
:::

## Shared File Protection

Modelibr uses file deduplication - identical files are stored only once. This means:

- If two models use the same file, deleting one doesn't affect the other
- Permanent deletion only removes files that aren't used elsewhere
- You'll see a warning if attempting to delete shared files
