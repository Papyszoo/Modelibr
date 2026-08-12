---
sidebar_position: 7
---

# Scripts

Modelibr stores source code as a first-class asset type. Keep shaders, gameplay snippets, tool scripts, and configuration files in the same library as the models and textures they belong to - with syntax highlighting, live shader previews, and the same organization tools as every other asset type.

:::note Video placeholder
A dedicated Scripts walkthrough video will be added later.
:::

## Creating Scripts

There are two ways to add scripts to your library:

- **Upload files** - click **Upload** or drag source files onto the Scripts page
- **Create in-app** - click **New Script**, pick a name and language, and optionally start from a template

**Supported formats:** JavaScript/TypeScript (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`), Python (`.py`), C# (`.cs`), C/C++ (`.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`), Lua (`.lua`), Java (`.java`), Go (`.go`), Rust (`.rs`), Ruby (`.rb`), PHP (`.php`), shell (`.sh`), SQL (`.sql`), GDScript (`.gd`), shaders (`.glsl`, `.vert`, `.frag`, `.hlsl`, `.shader`), and data files (`.json`, `.yaml`, `.yml`, `.xml`)

## Editing

Open a script card to launch the script viewer:

- **Code editor** with syntax highlighting for the script's language
- **Description** field for notes about what the script does and how to use it
- **Code/preview splitter** - adjust how much space the editor and the preview take, or toggle the layout

## Live Shader Preview

GLSL and HLSL scripts get a **live in-page preview** rendered next to the code:

- Choose the preview geometry from the viewer menu: **sphere, cube, plane, cylinder, or torus**
- Or pick **Apply to model** to render the shader on a model from your own library
- The preview updates as you edit, so you can iterate on a shader without leaving the browser

## Templates

The Scripts page includes a **Templates** section:

- Start a new script from a **built-in starter template** instead of an empty file
- Create **your own templates** and duplicate existing ones
- Useful for boilerplate you reuse often - a shader skeleton, a component stub, a tool-script header

## Organizing Scripts

### Categories

Use the **category tree** in the sidebar to organize scripts into hierarchical folders. Drag scripts between categories, and manage the tree from the category manager dialog.

### Search and filters

Use the search box and the filter panel above the grid to narrow the script list.

### Packs and Projects

Scripts are first-class assets in [Packs](./packs) and [Projects](./projects) - open a pack or project and add scripts to it alongside models, textures, sprites, and sounds.

## Recycling

Deleting a script moves it to [Recycled Files](./recycled-files), so you can restore it later or delete it permanently.
