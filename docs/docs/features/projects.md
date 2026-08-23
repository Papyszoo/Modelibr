---
sidebar_position: 8
---

# Projects

Projects in Modelibr let you group related assets together for organized workflows. A project can contain models, texture sets, environment maps, sprites, sounds, and scripts - everything needed for a game level, scene, or creative work.

<div className="feature-video-container">
  <video controls width="100%" autoPlay muted loop>
    <source src="/videos/projects.webm" type="video/webm" />
    <p className="video-fallback">Demo video is being generated...</p>
  </video>
</div>

## Creating a Project

1. Open the **Projects** tab from the left sidebar
2. Click **Create New Project**
3. Enter a name and optional description
4. Click **Create**

## Project Viewer

Click any project card to open the Project Viewer, which shows all assets organized by type:

| Section              | Contents                                                    |
| -------------------- | ----------------------------------------------------------- |
| **Models**           | 3D models added to this project                             |
| **Texture Sets**     | PBR texture collections                                     |
| **Environment Maps** | Panoramic or cube-based lighting assets with their variants |
| **Sprites**          | 2D image assets                                             |
| **Sounds**           | Audio files                                                 |
| **Scripts**          | Source code and shader assets                               |

### Adding Assets

Within the Project Viewer:

1. Click **Add** in any asset section
2. A dialog shows all available assets of that type
3. Select one or more assets
4. Click **Confirm** to add them to the project

Environment maps are managed as their own asset type inside projects, so scene lighting references can live beside the models, textures, sprites, and sounds used by that project.

### Removing Assets

Right-click an asset within the project and select **Remove from Project**.

:::note
Removing an asset from a project does NOT delete the asset itself - it only removes the association.
:::

## Profile - what is being made

A project's **Profile** section says what the project is targeting, and it is the input an
agent works from. Five dimensions, each a closed-ish vocabulary you can add to:

| Dimension     | What it decides                                                                    |
| ------------- | ---------------------------------------------------------------------------------- |
| **Engines**   | What this is authored in and what it runs in. Several is normal, each with a role. |
| **Platforms** | The tightest one decides the suggested budget.                                     |
| **Genres**    | What kind of thing is being made.                                                  |
| **Styles**    | Ranks search results, and is checked against every asset choice.                   |
| **Camera**    | How the player sees the world.                                                     |

Below them, **Budgets** caps what one asset - and a whole scene - may spend. Selecting
platforms produces a **suggestion** rather than a value: the hint names the platform it came
from ("Quest is the tightest platform here: 5,000 triangles per asset") and nothing is
written until you accept it. A number applied without a reason is a number nobody can argue
with later.

### The agent brief

Expand **Agent brief** to read, verbatim, what the tools hand an agent about this project -
the guidance lines, the world convention and what it converts to in each selected engine,
and which search terms the styles boost or rank down. Nothing on that panel is composed in
the browser.

This is deliberately the same text the agent gets. When it picks something odd, the useful
question is not why it did that but what it was told, and the answer is on this page. Where
the selected engines disagree - one Z-up, one Y-up - the conflict is **stated, never
resolved**: "works in both" is a constraint someone has to decide about.

A scene linked to a project shows the project as a chip in the scene editor's header, and
the same brief opens from there.

## Deleting a Project

1. Right-click a project card
2. Select **Delete**
3. Confirm the deletion

:::tip
Deleting a project removes the project container only. All assets within it remain in your library.
:::
