---
sidebar_position: 9
---

# WebDAV

Modelibr includes a WebDAV endpoint so you can use File Explorer or Finder to browse files. You can open them just like files on your computer.

## How to access WebDAV

There is an instruction for your operating system on settings page.

## What you can do with WebDAV

Use WebDAV when you want to:

1. Mount your Modelibr library in a file browser
2. Install Blender CLI or other DCC tools that support WebDAV-based asset access
3. Open editable `.blend` files from your library
4. Review library contents from another machine on your local network

## Blender CLI workflow

When you install Blender CLI on settings page you have 

In WebDAV Model directory you can have exposed editable `.blend` files - one uploaded by user and second one generated with Blender CLI - with your model imported and textures attached.

When you open a model's `.blend` file, make changes, and save it, Modelibr creates a new model version automatically.

That new version is then processed through the Blender CLI pipeline so Modelibr can extract `.glb` files with baked textures.

## Exposed directories

1. Models
2. Texture Sets
3. Sprites
4. Sounds
5. Projects -> With subdirectories (Models, Texture Sets, Sprites, Sounds)
6. Packs -> With subdirectories (Models, Texture Sets, Sprites, Sounds)

## Notes

- Availability depends on your local deployment configuration and network access - you can change ports in .env file.

:::note Video placeholder
The walkthrough video for this page will be added later.
:::
