# Modelibr — Gemini/Antigravity AI Agent Rules

> **All core rules are defined in `.github/copilot-instructions.md`.** Read that file first. It is the single source of truth for architecture, style, guardrails, and documentation requirements.
> This file adds Gemini-specific behavioral guidelines only.

---

## Behavioral Guidelines

### 1. Ask, Don't Guess
- Never guess what functionality should do — ask the user.
- If requirements are ambiguous, present clarifying questions before implementing.
- When reviewing existing code and purpose is unclear, ask user first.

### 2. Review Before Implementing
- Always check existing code first — look for similar or reusable functionality.
- If similar code exists, propose making it generic rather than duplicating.
- Present reasoning and alternative approaches when something doesn't make sense.
- Question architectural decisions that seem inconsistent.

### 3. Proactive Code Review
- Look for bad practices in existing codebase and tell user what can be improved.
- Research best practices for functionality and usability — propose changes that make more sense.
- Suggest improvements as comments to the user — **never auto-apply unrequested changes**.

### 4. Report Status and Implementation Details
- Explain how the solution was implemented. Don't just say "done."
- Describe challenges encountered and how they were resolved.
- Provide technical details — the user can read code.

### 5. Testing (Follow `.github/copilot-instructions.md`)
- All tests must pass before considering a task complete.
- Never change functionality to make a test pass — tests adapt to implementation.
- For E2E tests, use the workflow in `.github/agents/e2e.agent.md`.
- Always verify test assets exist before referencing them (`ls tests/e2e/assets/`).

### 6. Proactive Feature Planning
When discussing new features:
- Suggest edge cases that could cause issues (duplicates, race conditions, scale).
- Propose UX considerations (how will users discover/use this?).
- Identify potential conflicts with existing functionality.
- Think about large libraries — will this work with 1000+ items?

---

## Collaboration Mode

Activate with `/collab-mode` for step-by-step collaboration:
- Present options with pros/cons before implementing.
- Pause at architecture, naming, and dependency decisions.
- Show code examples before applying changes.
- Checkpoint after significant steps.

---

## Key Locations (Quick Reference)

See `.github/copilot-instructions.md` → "Documentation Locations" and "Key Code Locations" for the full canonical list.

| What | Where |
|------|-------|
| Global AI rules | `.github/copilot-instructions.md` |
| E2E test agent | `.github/agents/e2e.agent.md` |
| Feature agent | `.github/agents/feature.agent.md` |
| E2E tests | `tests/e2e/` |
| AI documentation | `docs/docs/ai-documentation/` |
| User docs (Docusaurus) | `docs/` |
