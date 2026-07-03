---
sidebar_position: 1
title: Roadmap
---

# Roadmap

Where Modelibr is heading. This is a direction, not a schedule — priorities
shift based on feedback from [Discord](https://discord.gg/KgwgTDVP3F) and
[GitHub Issues](https://github.com/Papyszoo/Modelibr/issues). Completed work
moves to the [Changelog](./changelog.md).

## Getting assets in, and finding them again

The core promise: your collection stops being a pile of folders.

- **Smart archive ingestion** — drop a downloaded asset pack (zip) and have its models, textures, and sounds recognized and sorted instead of extracted by hand
- **Bulk importer** — point Modelibr at an existing folder tree and bring a whole collection in gradually
- **Duplicate-aware uploads** — when a new upload looks like a model you already have, suggest adding it as a version instead of creating a clone
- **Deeper metadata and filtering** — keep extending the extracted geometry/animation/audio metadata and the list filters built on it

## Animations and rigs

First-class support for rigged and animated models: previewing animation clips
in the viewer and organizing them alongside the models they belong to.

## Getting assets out

Export and conversion, so the library can hand an asset to your engine or DCC
tool in the format it needs — not just the format it was uploaded in.

## Scene composition (Stages rework)

The Stages tab — composing models, lights, and helpers into scene arrangements —
is currently disabled while it gets redesigned. It will return once the
composition and lighting workflow is worth shipping.

## Data safety

- Automatic backup before database migrations, and integrity reporting for stored files
- Continued hardening of the Blender/WebDAV save pipeline

## Distribution and polish

- Published Docker images, so Docker users don't need to clone the repository
- Code signing for the desktop installers (planned around 1.0) — removes the SmartScreen/Gatekeeper warnings and enables full macOS in-app updates
- Ongoing UX polish across the asset library pages

## Explicitly out of scope (for now)

- **Accounts and authentication** — Modelibr targets a single artist or a small trusted network; exposing it to the open internet is not a goal
- **Hosted or cloud services** — local-first is an invariant, not a deployment option
