---
description: Group models, textures, environment maps, sprites, sounds, scripts, and VFX into a project for one level, scene, or production, with briefs and levels.
sidebar_position: 11
---

# Projects

Projects in Modelibr let you group related assets together for organized workflows. A project can contain models, texture sets, environment maps, sprites, sounds, scripts, and visual effects - everything needed for a game level, scene, or creative work.

<div className="feature-video-container">
  <video
    controls
    width="100%"
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    poster="/img/videos/projects-poster.webp"
  >
    <source src="/videos/projects.webm" type="video/webm" />
    <p className="video-fallback">A short screen recording of browsing a project board in Modelibr</p>
  </video>
</div>

## Creating a Project

1. Open **Projects** from the New Tab page (Projects is pinned by default)
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
| **VFX**              | Visual effects added to this project                        |

### Adding Assets

Within the Project Viewer:

1. Click **Add** in any asset section
2. A dialog shows all available assets of that type
3. Select one or more assets
4. Click **Confirm** to add them to the project

Environment maps are managed as their own asset type inside projects, so scene lighting references can live beside the models, textures, sprites, and sounds used by that project.

### Comments on assets

Every model, texture set, sprite, sound, environment map and VFX card in a project
carries a comments badge: a count of its open comments that opens the asset's
comment thread. Write what should change, resolve a comment once it has been acted
on - optionally with a short resolution saying what changed - and reopen it if it
comes back. Resolved comments stay in the thread, quieter, so the reason for a
change is still there to read. Levels, characters and reference images have the
same thread.

### Removing Assets

Right-click an asset within the project and select **Remove from Project**.

:::note
Removing an asset from a project does NOT delete the asset itself - it only removes the association.
:::

## Project studio - production context

The Project details page opens with a **Project studio** above the asset
sections, and the studio has its own four views: **Overview**, **Levels**,
**Cast**, **References**. They are views inside the Project's tab, not dock tabs -
the Project tab already has a tab bar for asset families, and a second nested one
would compete with it.

- **Overview** answers "where is this project": the level list and the notes and
  pinned ideas, which is where a new project starts.
- **Levels** adds the level's assets, derived from the Scenes filed under it -
  see [Level assets](#level-assets).
- **Cast** is the character list.
- **References** is the reference board.

The view you were on is kept in the tab's own state, so reloading or a trip to
another tab comes back to it.

The production context itself:

- **Levels** are ordered units such as `Forest Crossing`, with a description, a
  small fixed production status vocabulary, and reference images of their own.
  A level row is a summary of that level, not just its name. What a Level
  _uses_ is derived from the Scenes filed under it - see
  [Level assets](#level-assets) below.
- **Characters** are first-class production entities. Each one has a name, a
  description, tags such as `player`, `enemy`, `npc` or `boss`, linked reference
  images, linked library models, comments, abilities, and variants that can be
  scoped to a Level. Linking a library model to a character also adds it to the
  project's models. A character tagged `enemy` titles its comments area
  **Enemy weaknesses and comments**, so weaknesses, behaviour, and threat are
  written where they are read.
- **Comments & decisions** are plain-text comments. Each one is open or
  resolved, and a resolved comment can carry a short resolution saying what
  changed. Pinning a comment marks it as a project decision. A comment can
  target the Project, one Level, one reference image, one Character, or one
  asset in the project, and each comment names its target rather than printing
  an id.
- **References** are the project's concept images, gathered on one Reference
  Board. Every image can be titled, linked to any number of Levels and
  Characters, annotated with its own comments, and removed from the project while
  the underlying file stays in your library. The old single "level scope" per
  image is now a set of links, so one mood board can serve several levels and
  several characters at once.

Character editors open one section at a time - identity, comments, media, abilities,
variants - and each create action sits behind a `+`, so the default view stays a
scannable list of the cast. Deleting a character removes its production links;
its comments move to the project, and the linked files, models, and levels stay
in the library.

Everything a character already has is edited in place, not re-created: an
ability or a variant opens a small inline form pre-filled with its current
values, an image's title and caption and a linked model's label are edited where
they are shown, and saving leaves the section open. Production data that can only
be added and removed is a read-only surface wearing an editing costume.

### Reference links

The Reference Board links images to targets through
`POST /projects/{projectId}/references/{referenceId}/links` with exactly one of
`projectLevelId` or `projectCharacterId`. Both targets in one request is a
`400 InvalidProjectReferenceLink`; an unknown target is a `404`. Deleting a Level
or a Character unlinks the image instead of removing it
(`SetNull` on the link), and removing a level link that a rollback cannot express
is reported rather than silently dropped.

The board has one **target filter** - all references, one Level's, or one
Character's - so "what does this level have to go on" is one click rather than a
scan. The filter is applied by the server
(`GET /projects/{projectId}/references?levelId=&characterId=`), the header counts
what is shown against the total, and adding a link keeps working while a filter
is active because the picker is driven by the project's Levels and Characters
rather than by the filtered images.

The first slice keeps the existing asset sections intact while making the
Project-level context visible in the same place.

### Level assets

A Level has no assets of its own. Its **Level assets** section is derived: it
reads the Scenes filed under the selected Level and reports what those Scenes
place, with the Scene each reference came from named on the row. There is no
second relationship to maintain, and nothing on this surface is editable - a
placement is changed in the Scene, where it is authored (see
[Scenes](/docs/features/scenes)).

### Opening a level's scene

Each level row in the **Levels** view carries one control that goes into that
level's Scene, and it means whichever of the two things is useful:

- a level that already has a Scene opens it in a tab of its own, the primary
  Scene first, so it opens beside whatever else you have open;
- a level that has none gets one - named after the level, filed under it as its
  primary Scene, and opened.

Creating and opening are the same gesture on purpose. A level whose scene can only
be created and not reached would be a dead end, and an empty scene is the right
starting point anyway: there is nothing to ask about before one exists, and the
name it gets is the level's - editable immediately in the editor that opens.

Two relationships are shown apart, because they answer different questions:

- **From level scenes** - everything the Level's Scenes place, deduplicated
  across them. A model used by two Scenes appears once, naming both; the Level's
  primary Scene is marked `primary`.
- **Project members** - the models explicitly added to the Project, whether or
  not a Scene places them. An asset can appear in both groups, and each row says
  which relationship it is reporting.

A Level with no Scenes yet is the ordinary first state of a project, so it reads
as an instruction - link a Scene to the Level - rather than as a failure. The
picker defaults to the Level first in production order, and each Scene's
document is read through the same query the scene editor uses, so an agent's
edit to a Scene is reflected the next time the section loads.

## Profile - what is being made

A project's **Profile** section says what the project is targeting, and it is the input an
agent works from. It is collapsed under **Project setup** by default, so it never competes
with the production context above it. Five dimensions, each a closed-ish vocabulary you can
add to:

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
the same brief opens from there. The chip is also where the link is changed or cleared - a
scene belonging to no project says so plainly, because it means the agent gets no budget, no
style and no world convention rather than a quiet default. **New scene** offers a project up
front for the same reason, but it stays optional - leaving it as **No project** is allowed,
and the scene simply gets none of that.

Linking is a scene write: the revision moves, it is audited, and it can be reversed.

## Deleting a Project

1. Open the visible **Project actions** button on the project card
2. Read the confirmation, which names the project
3. Choose **Delete Project** or **Cancel**

The confirmation is deliberately required. **Cancel** makes no request. Deleting a project
removes the project container only; all assets within it remain in your library.
