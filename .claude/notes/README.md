# .claude/notes — shared engineering knowledge

Durable context that the code can't explain on its own: why a decision went the
way it did, what a subsystem's failure modes are, what an incident taught us, and
what's already been ruled out.

**Committed and tool-neutral.** Any agent working in this repo reads these —
Claude Code, Codex, Antigravity — and so can a human. `AGENTS.md` points here.

Complements `.claude/skills/` (enforceable conventions, also committed).

## What belongs here — and what doesn't

**Here:** architecture and design rationale, gotchas and failure contracts,
incident write-ups, testing strategy, feature state and the traps a feature
taught.

**NOT here — this repository is public.** Keep out of these files:

- machine-specific setup (local Docker/VM config, personal scripts, host paths)
- production infrastructure: server addresses, credentials, deploy specifics
- business decisions (pricing, payment providers) and unreleased roadmap
- anything referencing gitignored paths, since a reader can't follow the pointer

That material belongs in the maintainer's private agent memory, not in the repo.
If you're unsure, leave it out — a note is easy to add later and impossible to
un-publish.

## Convention

- **`MEMORY.md` is the index** — one line per note. Keep it to one line each;
  never put content there.
- **One topic per file.** Bullets and pointers over prose; long files drain
  context for every agent that reads them.
- **Categorized in subfolders.** Cross-link with `[[relative/path.md]]`.
- **Facts go stale — date them.** Verify against the code before asserting.
- Enforceable, always-applicable rules belong in `AGENTS.md` or a skill, **not
  here.** Notes are context; rules are instructions.

## Categories

| Folder | Contents |
|--------|----------|
| `store/` | The asset store integration contract and its production incidents |
| `extraction-mcp/` | Asset extraction substrate, MCP server, search quality |
| `release/` | Release process, version history, desktop self-update |
| `testing/` | Strategy, local runner + Test Studio, flakiness triage |
| `features/` | Shipped and in-flight feature notes |

## Index

See [MEMORY.md](MEMORY.md).
