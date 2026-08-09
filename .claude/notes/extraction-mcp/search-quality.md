# MCP search quality — the verdict and what to do about it

Measured 2026-08-08 with a throwaway retrieval harness against a real
1,357-model instance (probes: `flint_tool`, `Fox`, `OfficeRound`).

## Verdict: lexically excellent, semantically blind

**Hits target at rank #1:** exact name, tokens, natural phrase, ≥3-char typos
(trigram), and every structural filter.

**Misses completely — every conceptual query:** `weapon` → 0 hits,
`animal` → no Fox, `building` → no office, plus `prehistoric` / `creature` /
`vehicle`. There is no category, tag, or embedding layer bridging concept →
instance.

**Conclusion: useful for an agent that already knows the author's vocabulary; not
for intent-based retrieval — which is how agents naturally reason.**

## The chosen bridge: auto-categorization

The user's **auto-categorization** idea is the pragmatic local-first fix — a
deterministic keyword→category derive rule, reusing the base-meshes category
pipeline. A local ONNX embedding model is the heavier alternative and **must stay
offline** to respect the local-first invariant.

## Calibration follow-ups

- **Duplicate hits** — asset-level AND part-level docs both return for the same
  asset. Noisy; group by asset.
- **Shape-class miscalibrated** — 396/1357 classified "planar" (29%) is too high.
  Uncalibrated by design (prompt 26; geometric priors off by default). A torus
  classifies as "blocky".
- **Degenerate/empty nodes get indexed** (e.g. "8 tris, 0×0×0 m") — pure noise.
- **base-meshes is normalized to ~2 m**, so dimension filtering can't discriminate
  within that pack.
- **Asset-level tokens are still empty.** Name search works via `DisplayName`
  ILIKE, but fuzzy trigram only fires on *part* tokens — the prompt-23
  "asset-name Include" follow-up would fix this.

Related: [[substrate-and-mcp.md]]
