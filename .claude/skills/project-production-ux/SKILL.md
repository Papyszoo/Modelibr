---
name: project-production-ux
description: Use when designing or editing Modelibr Project, Level, character, variant, reference, or comment UX. Enforce a dense local-first game-production workspace where entities are described through useful content, not name-only forms.
---

# Project production UX

## Product shape

- Modelibr is a game-production workspace, not a generic DAM or document editor.
- The primary hierarchy is Project → Level → production entities and references.
- Levels are not name-only rows. A level needs a useful description, reference images, comments, and links to the entities/assets used there.
- Characters and similar production entities need more than a label: identity, role/tags such as player/enemy/NPC, linked models/images, comments, abilities, and variants.
- Variants can be level-related; do not force every entity into a rigid level hierarchy.

## Information hierarchy

- Keep the Project page focused: production context first, then overview/profile/reference work.
- Use the existing left/right dock split deliberately. Do not squeeze a multi-column workspace into the narrow left content column.
- Use flat separators and compact rows before adding nested cards. Avoid card-inside-card layouts.
- Put create/edit actions behind compact `+` or overflow controls. Forms should not dominate the default view.
- Default views are for scanning and orientation. Open editors, pickers, and forms only when the user asks for them.

## Profile pickers

- Profile dimensions such as Engines, Platforms, Genres, and Styles are self-explanatory; do not print explanatory paragraphs below every label.
- Show selected project values as chips or a compact summary.
- Put the vocabulary picker behind a `+`/browse action next to the selected values.
- Suggest existing values while adding; allow a deliberate custom value only when the domain permits it.
- Keep the picker local to the field and usable in a half-width dock.

## Entity editing

- A character/entity editor should expose meaningful sections: identity, tags, linked media/models, comments, abilities, and variants.
- Enemy-specific fields should be contextual: weakness, threat, behavior, and abilities should not be shown for every entity type.
- Use plain text and compact structured fields before introducing rich text, custom schemas, or a plugin system.
- Preserve user-authored descriptions and notes; do not replace them with generated summaries.

## Scope discipline

- Do not add task boards, calendars, chat, permissions, arbitrary hierarchies, or generic entity-link infrastructure without a demonstrated journey.
- Do not duplicate asset relationships: link existing media/models and derive usage where possible.
- Defer broad Blender/MCP/editor work until the human Project/Level workflow is useful.

## Verify

- Check the populated, empty, narrow half-dock, and full-width states.
- Confirm forms are hidden by default and compact actions open the relevant editor.
- Confirm no duplicate reference boards, name-only level rows, explanatory label clutter, or nested decorative cards remain.
- Run the focused frontend tests plus lint, format, and build before claiming the UX pass is complete.
