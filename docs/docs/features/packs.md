---
sidebar_position: 8
---

# Packs

Packs in Modelibr are reusable asset bundles that can be shared across multiple projects. Unlike projects, which represent unique work contexts, packs let you group commonly used assets together — such as a set of environment props or character models — and reuse them wherever needed.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/Modelibr/videos/packs.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Creating a Pack

1. Open the **Packs** tab from the left sidebar
2. Click **Create New Pack**
3. Enter a name and optional description
4. Click **Create**

## Pack Viewer

Click any pack card to open the Pack Viewer, which shows all assets organized by type:

| Section          | Contents                        |
| ---------------- | ------------------------------- |
| **Models**       | 3D models included in this pack |
| **Texture Sets** | PBR texture collections         |
| **Sprites**      | 2D image assets                 |
| **Sounds**       | Audio files                     |

### Adding Assets

Within the Pack Viewer:

1. Click **Add** in any asset section
2. A dialog shows all available assets of that type
3. Select one or more assets
4. Click **Confirm** to add them to the pack

### Removing Assets

Right-click an asset within the pack and select **Remove from Pack**.

:::note
Removing an asset from a pack does NOT delete the asset itself — it only removes the association.
:::

## Packs vs Projects

|              | Packs                              | Projects                     |
| ------------ | ---------------------------------- | ---------------------------- |
| **Purpose**  | Reusable asset bundles             | Unique work contexts         |
| **Sharing**  | Shared across multiple projects    | Standalone containers        |
| **Use case** | "Environment Props", "UI Elements" | "Level 1", "Main Menu Scene" |

Packs are designed for reuse — create a pack of common assets once, then reference it from any project. Projects are unique work contexts tied to a specific scene, level, or deliverable.

## Deleting a Pack

1. Right-click a pack card
2. Select **Delete**
3. Confirm the deletion

:::tip
Deleting a pack removes the pack container only. All assets within it remain in your library.
:::
