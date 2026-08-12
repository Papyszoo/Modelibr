# docs-audit

Fails CI when user-facing docs contradict the code. Run with:

```bash
npm run docs:audit
```

## What it checks

| Docs claim | Source of truth |
| --- | --- |
| Model/sound format lists (`models.md`, `sounds.md`, README) | `src/Domain/ValueObjects/FileType.cs` extension registry |
| Tab table covers every tab type (`user-interface.md`) | `TabType` union in `src/frontend/src/shared/types/ui.ts` |
| Quick-start URLs use the real port (landing page, `intro.md`) | `FRONTEND_PORT` in `.env.example` |
| Video embeds resolve, manifest videos are shown | `docs/videos/video-manifest.js` |

Zero dependencies - plain Node. Wired into `ci-and-deploy.yml` as the
**Docs Audit** job (every push/PR, not path-filtered, so it can be made a
required check without deadlocking).

## When it fails

Fix the docs, not the check. If a mismatch is intentional (e.g. a feature is
disabled in the UI), add an entry to the check's exemption list in
`index.mjs` **with a reason**. When adding new machine-checkable facts to the
docs (formats, ports, enums), extend the audit in the same PR - that converts
the "update the docs" ripple from discipline into a failing check.

## History

Built after a docs review found drift this audit now catches mechanically:
STL/3MF missing from format lists two releases after shipping, 11 of 23 tab
types undocumented, and the landing page pointing at a port the app hasn't
used since 0.1.
