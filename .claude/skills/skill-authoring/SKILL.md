---
name: skill-authoring
description: How to write and maintain Modelibr agent skills — compactness budget, structure template, staleness rules, what belongs in a skill vs the code vs CLAUDE.md. Use when creating or editing anything under .claude/skills/.
---

# Skill authoring (keep skills compact and specific)

Skills are loaded into agent context. Every line that doesn't change agent
behavior is context pollution. The litmus for each line: **"would an agent
do something wrong without this?"** If no — delete it.

## Budget & tone

- Target one screen (~90 lines) per skill. Hard signal to trim: scrolling.
- No history, no changelogs, no "recently changed/added in PR #X", no
  narrative, no praise. Git holds the history.
- State facts in present tense as checkable claims naming a file/symbol
  (`CustomWebDavHandler.WriteFileAsync` checks `Stream.Null`), so a reader
  can verify against code in seconds.

## Structure template (in this order, sections optional)

1. **Cardinal rule / traps** — the things that break production or data if
   an agent doesn't know them. First, always.
2. **Map** — files with one-line roles. No file trees.
3. **Rules** — imperatives ("never X", "always Y via Z"), grouped by topic.
4. **Testing** — what coverage exists, what's manual, what gates apply.
5. **Verify** — exact commands to run before claiming done.

## Maintenance rules

- **Code wins.** If a skill claim contradicts the code, fix the skill in the
  same session (CLAUDE.md rule). Don't soften with "may have changed".
- **Prefer replace/delete over append.** A feature that changes behavior
  rewrites the stale line; it doesn't add a second paragraph beside it.
- Temporary state ("until prompt N lands") is allowed ONLY with the trigger
  that removes it — and landing prompt N must delete the clause.
- Prompt/PR references only when they're the pointer to fuller context an
  agent may need, never as attribution.
- `description:` frontmatter = trigger conditions, concrete paths ("Use when
  creating or editing anything under src/X") — that's what decides loading.
- Don't duplicate CLAUDE.md or another skill; name the other skill instead.
- One domain per skill. If a section serves a different audience/task,
  it's a different skill (or belongs in none).

## Review checklist before committing a skill edit

- [ ] Every new line passes the litmus test
- [ ] No stale claims left in touched sections (grep the named symbols)
- [ ] Still one screen-ish; something got deleted if something got added
- [ ] Verify commands still correct
