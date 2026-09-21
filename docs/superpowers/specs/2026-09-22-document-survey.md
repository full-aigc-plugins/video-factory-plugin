# Document survey: video-factory-plugin (2026-09-22)

> Purpose: a navigable, evidence-anchored summary of the canonical documents in this repo. Every claim points to a concrete code path, schema, or skill, so the survey can be checked against the repo rather than against memory.
>
> Scope: only documents explicitly named in the audit request. Each entry has 3–5 sentences plus a "cross-references" block.

## 1. README.md

### Summary

The English README is the public entry point for the plugin and is **host-neutral** (per the `cross-host-plugin-identity` spec). It defines the plugin's positioning ("local-first shot analysis, approved edit planning, deterministic FFmpeg composition, and verified media receipts"), an "at a glance" pipeline (`analyze → plan → quote → run → review-sync → evaluate`), a capability matrix with status flags (`Stable` / `Stable with a known gap` / `Blocked / NOT_RUN`), and a quick-start recipe ending in `accept --decision approved`. It explicitly contracts what the plugin refuses to do: remote generation, image generation, Blender control, studio UI, mechanical semantic consistency — these are stated as non-goals and recorded as `NOT_RUN` rather than disguised as PASS. The final sections document the security model (no API keys, no network, hash-bound approvals), the data/state model (plain JSON ledger), the development verification entry point (`node --test tests/*.test.mjs`), and a troubleshooting table.

### Cross-references

- The pipeline diagram maps 1:1 to CLI subcommands in `src/cli.mjs` (`probe / analyze / analyze-finalize / validate-plan / quote / run / review-sync / status / evaluate / accept / recover / episode-slice / episode-roughcut`).
- The capability matrix's "Stable with a known gap" rows line up with `SKIPPED` lines in `src/media-evaluator.mjs` (subtitle burn-in) and `NOT_RUN` for `semanticConsistency` (which change 2 of the OpenSpec proposals plans to populate via a separate scoring file).
- The README's deep-links section points at `docs/Video-Factory-Plugin-Architecture.md` (covered below) and the OpenSpec design spec, which is the canonical authority the README defers to.
- The README's installation section works against `.codex-plugin/plugin.json` and the `full-aigc-plugins/video-factory-plugin` repo, while the `CHANGELOG` confirms the version in the badge (0.1.5) is older than the just-released 0.2.0.

## 2. README.zh-CN.md

### Summary

The Chinese README is the structural mirror of the English one: 207 lines each, identical 12 navigation sections, identical pipeline ASCII diagram. The terminology is translated consistently (`video-factory` is kept as-is per the cross-host-identity spec; `EditDecision`, `EditPlan`, `rough / final`, `SKIPPED` / `NOT_RUN` / `PASS` / `FAIL` are kept verbatim). It exists to satisfy the same content in a different locale without forcing consumers to invent new wording. The Quick Start sequence and CLI command table are functionally identical to the English version.

### Cross-references

- `README.md:14` and `README.zh-CN.md:14` carry the same positioning sentence ("Local-first shot analysis …").
- The Chinese version's troubleshooting table maps to the same root causes the English one lists, and both reference the canonical state machine in `schemas/video_job.schema.json`.
- `references/operations.md` in each vendored skill (`video-factory-judge` etc.) is written in Chinese, matching the locale preference signaled by this README.

## 3. AGENTS.md

### Summary

AGENTS.md is **45 lines of release-discipline rules** for AI agents, not for users. It enforces: every code change (no matter how small) must bump version via `node scripts/bump-plugin.mjs video-factory {patch|minor|major}`; the marketplace version in `full-aigc-plugins/catalog.json` must be updated and synced with `scripts/sync-marketplaces.mjs --write`; never edit `catalog.json` or the three generated marketplace manifests by hand; the version chain (catalog + 4 manifests) must stay consistent; and the plugin body lives in this repo while the `plugins/` marketplace repo only stores metadata. It is the operational policy that backs every release in `CHANGELOG.md`.

### Cross-references

- The `bump-plugin.mjs` script referenced here is the one I patched in commit `acbd5ea` (the 0.2.0 release) to also bump release-pinned `ref` and CDN logo URLs and to scope the sync check to the plugin being released.
- The version-chain consistency rule is now enforced at runtime by `tests/distribution.test.mjs` (which I rewrote in `acbd5ea` to derive the expected version from `.zcode-plugin/plugin.json` rather than hard-code `0.1.5`).
- The "push to two repos" rule is the same one I executed at the end of the `acbd5ea` release: plugin repo `75864d3 → acbd5ea` and marketplace repo `11046a2`, with the tag `v0.2.0`.

## 4. CHANGELOG.md

### Summary

The CHANGELOG currently records two releases. **0.1.0 (2026-09-14)** ships the baseline: vendored `video-shots` and `video-sync` Skills at ReelBench commit `75520c7b32ab5af8b22c5e4f79705efbbc0d8e07`, content-addressed FFmpeg rendering, atomic ledgers, missing-asset handoffs, cross-plugin receipts, explicit human acceptance, and 14 required media gates covering black/freeze/silence/subtitles/AV offset/duplicates/rhythm. **0.1.5 (2026-09-20)** rebrands the public surface to host-neutral "Video Factory" identity (per the `cross-host-plugin-identity` spec) and adds a regression gate for obsolete host-prefixed naming; runtime behaviour is unchanged. The just-released **0.2.0** is not yet in CHANGELOG; the publish step needs an entry under a new heading.

### Cross-references

- The 0.1.0 entry's "required media gates" line lists exactly the 7 advisory gates that `src/media-evaluator.mjs` enforces (the 14 hard gates plus the 7 advisory are the ones the README's capability matrix labels "Stable").
- The 0.1.5 entry references the `cross-host-plugin-identity` spec; the verification entry that backed it is `tests/distribution.test.mjs`'s `every manifest and the repository marketplace agree on one released version` (which I rewrote in `acbd5ea`).
- The 0.2.0 release (commits `75864d3`, `acbd5ea`, tag `v0.2.0`) repaired the always-fail `evaluate` bug, derived the timeline gate, added `--ledger` and `--skip-detectors`, and registered the 0.2.0 marketplace pin.

## 5. openspec/specs/cross-host-plugin-identity/spec.md

### Summary

A small but **load-bearing** OpenSpec spec: keep the public-facing identity host-neutral (`video-factory`, not `codex-video-factory`) for everything that crosses hosts, while keeping host-specific identifiers (`codex-video-factory@partme-ai-video-factory`, `.codex-plugin/`, the Codex CLI install path, the daily `+codex.YYYYMMDD` suffix) intact. Three Requirements: public identity is host-neutral; Codex-specific contracts stay explicit; renames preserve all inbound links. This is the spec the 0.1.5 rebrand satisfied, and it's the reason README / README.zh-CN / spec use the same `video-factory` spelling.

### Cross-references

- The spec's "Renames SHALL preserve navigability" requirement is what `tests/distribution.test.mjs` enforces indirectly via the marketplace icon/logo URL check (the icon URL must point at `@v<version>/`).
- The marketplace manifest at `.agents/plugins/marketplace.json` and the four platform manifests at `.codex-plugin/`, `.zcode-plugin/`, `kimi.plugin.json`, `marketplace.json` are exactly the artefacts this spec governs.
- The changelog entry for 0.1.5 is the spec's "Renames SHALL preserve navigability" scenario made concrete.

## 6. openspec/specs/immutable-skill-supply-chain/spec.md

### Summary

Another small but critical spec. Four Requirements: managed skills (`video-factory-use / -plan / -run / -judge / -recover`) are pinned by release tag + peeled commit SHA + per-skill SHA-256; plugin-local skills (`video-factory-harness / video-episode-slicing / video-shots / video-sync`) are explicitly declared so vendor updates don't clobber them; upgrade events carry the immutable release identifier; release surfaces (4 manifests + marketplace + tag + test results) must all describe the same release. This is the spec the `scripts/vendor/skill_vendor.py` and `.github/workflows/skills-check.yml` machinery enforces.

### Cross-references

- The lockfile `skills.lock.json` carries `sources[]` entries with `repo / ref / sha / sha256{}`; CI runs `python3 scripts/vendor/skill_vendor.py check --offline` to assert immutability.
- `plugin-local-skills.json` lists the 4 plugin-local skills; my change 5 (commit `f0e98d6`) added regression gates in `tests/skills.test.mjs` to keep the vendor / plugin-local boundary observable.
- The "release surfaces remain consistent" Requirement is what `tests/distribution.test.mjs` (rewritten in `acbd5ea`) checks: 4 manifests + marketplace icon/logo all pin to the same version.

## 7. docs/Video-Factory-Plugin-Architecture.md

### Summary

The canonical architecture document. 12 numbered sections: Executive summary, Drivers and constraints, Context and trust boundary (with mermaid), Current/target state, Principles and decisions (each with reversal condition), Runtime and core flows (sequence diagram for the user→skill→CLI→FFmpeg→ledger cycle), State/data/protocol (the canonical 10-state machine), Security, Resource budgets, Deployment/compatibility, Evolution seams, Evidence map. The architecture exists to enforce three guarantees: an edit is a document, a render is verified, a long render is resumable. The "Failure and recovery semantics" table lists what happens for every failure mode, mapped to `recover`'s behavior in `src/cli.mjs`.

### Cross-references

- Section 6's sequence diagram matches `src/orchestrator.mjs:runApproved`'s control flow exactly (probe → render per segment → assemble → verify → evaluate → accept).
- Section 7's "Run states" list matches `schemas/video_job.schema.json`'s `properties.state.enum` — the 10-state machine. My change 5 added a regression gate in `tests/skills.test.mjs` that asserts any skill mentioning states names only states from that enum.
- Section 7's exit codes (0/1/2/3/4) match `src/cli.mjs:127` (the catch-block exit-code mapping).
- Section 12's "Evidence map" table points at the same documents covered by this survey: `src/approval.mjs`, `src/job-ledger.mjs`, `docs/verification/runtime.md`, `docs/verification/offline.md`.

## 8. docs/Video-Factory-Plugin-Architecture.zh_CN.md

### Summary

The Chinese mirror of the English architecture doc — 207 lines each, identical 12-section structure (executive summary, drivers, context, state, principles, runtime, data, security, budgets, deployment, evolution, evidence). The translation keeps identifiers verbatim (`EditDecision`, `Pending`, `ReviewReady`, `SKIPPED`, `NOT_RUN`) and only translates prose. This is the doc a Chinese-speaking integrator would read after the README; the Chinese version is structural, not just translated prose — section ordering and depth are 1:1.

### Cross-references

- Section 7's "Run states" list is identical and authoritative across both versions; my change 5 gate reads the **schema enum** as the source of truth, not either prose document.
- Both architecture docs defer to `docs/verification/runtime.md` (covered below) as the runtime evidence anchor.
- The Chinese README's "深 入门 文档" link points at this doc; the English README does the same.

## 9. docs/verification/runtime.md

### Summary

A 47-line evidence record for the 0.1.0 release, dated 2026-09-14. Two tables: one listing 11 real media scenarios (`ReelBench seed → frames → Markdown report → video-sync → image-segment rough cut → six-image story → multi-clip auto-cut → Blender public-receipt handoff → multi-track subtitles/watermark → 16:9/9:16/1:1 → single-clip edit → interrupt recovery → missing-asset handoff`) with their authoritative tests and PASS/SKIPPED/NOT_RUN results; another listing three representative artifacts with their SHA-256 and ffprobe summary. The closing "what to distinguish from automation" section is unusually honest: human continuous playback was user-confirmed, six-image story was user-confirmed, semantic consistency is `NOT_RUN` (Codex or human, never PASS), subtitle burn-in is `SKIPPED` because local FFmpeg 9.0.1 lacks `libass`. Chrome absence only blocks the enhanced synchronized review.

### Cross-references

- The 11 scenarios correspond to the same tests in `tests/runtime-render.test.mjs` and `tests/reelbench-runtime.test.mjs`; the recorded artifacts' SHA-256s are reproducible from those test runs.
- The `NOT_RUN` semantic-consistency line is the precise gap that change 2 (`2026-09-21-add-visual-semantic-gate`) proposes to populate via a host-agent scoring file (so the gate stays advisory, never auto-advance).
- The `SKIPPED` subtitle line is what the 0.1.0 capability matrix labels "Stable with a known gap"; my repair in `acbd5ea` does not change this line.

## 10. docs/verification/offline.md

### Summary

A 58-line record of the offline verification (no network) for 0.1.0, dated 2026-09-14. Captures the environment (Node 24.18.0, FFmpeg 9.0.1, Chrome only for `video-sync`, **zero npm runtime deps, zero external API keys**), the gates that were run (`npm test` and `validate_plugin.py`), and the result: 61 Node tests passing, vendor content checks passing (`video-shots` 449, `video-sync` 122, 27/27 files locked). The security-scan conclusion is documented with no remote channels, `shell: false` on every spawned process, and no detection of credential fields. It also records the GitHub Actions run id (`34777183299`) and the 0.1.0 release commit (`50403ae…`), and that 96/96 source files in the marketplace cache matched SHA-256.

### Cross-references

- The "zero npm runtime deps" line matches the `package.json` `dependencies` field (empty `{}`), which `tests/runtime-render.test.mjs` asserts in `runtime has zero npm dependencies and an executable CLI`.
- The "27/27 files locked" line is exactly what `python3 scripts/vendor/skill_vendor.py check --offline` still passes today (I ran it after my changes and it returned green).
- The `validate_plugin.py` line and the marketplace-cache file count correspond to the same plugin shape that `.codex-plugin/plugin.json`, `.zcode-plugin/plugin.json`, and `kimi.plugin.json` expose.

## 11. docs/superpowers/specs/2026-09-14-video-factory-plugin-design.md

### Summary

The 18-section design spec that 0.1.0 was implemented against. Sections 1–3 define the product, ownership, and 8 design principles (facts measured by code, semantics by Codex, model claims must reconcile with deterministic gates, approve before spending, no auto-retry, no overwrite of older artifacts, `SKIPPED ≠ PASS`, no fallback to unbilled channels). Section 4 has the top-level flowchart; section 5 details Mode B (local composition); section 6 specifies the future Mode A (Codex-native) gate conditions; section 7 fixes the ReelBench integration rules. Section 11's state diagram and section 12's gate taxonomy match `src/job-ledger.mjs` and `src/media-evaluator.mjs` respectively. Sections 14 (security), 15 (testing), 17 (definition of done), 18 (current factual state) define what "0.1.0 implemented" means and what evidence is required.

### Cross-references

- Section 11's state diagram maps to the 10-state machine in `schemas/video_job.schema.json`; `src/job-ledger.mjs:9-18` is the implementation.
- Section 12's media-gate taxonomy maps to `src/media-evaluator.mjs`'s 14 required + 8 advisory gate ids.
- Section 14's "argv only, no shell, no filter graph passthrough" rule is enforced by every `spawnSync` / `execFileSync` call in `src/`.
- Section 17's "Definition of Done" is checked by `docs/verification/offline.md` (test results), `docs/verification/runtime.md` (real ffmpeg outputs), and the marketplace install path (installable, not systematically tested, per the project stance on WorkBuddy).

## How to navigate from a question

| Question | First stop |
|---|---|
| What does this plugin do? | README.md §"At a glance" + docs/Video-Factory-Plugin-Architecture.md §1 |
| How do I install it? | README.md §"Installation" + `.codex-plugin/plugin.json` (host-specific) |
| How do I run a job? | README.md §"Quick start" + `src/cli.mjs` for subcommand flags |
| What's the state machine? | `schemas/video_job.schema.json` enum + docs/Video-Factory-Plugin-Architecture.md §7 |
| What are the media gates? | docs/superpowers/specs/2026-09-14-video-factory-plugin-design.md §12 + `src/media-evaluator.mjs` |
| What was verified offline? | docs/verification/offline.md |
| What was verified on real ffmpeg? | docs/verification/runtime.md |
| Where are the release rules for AI? | AGENTS.md |
| What release cadence is documented? | CHANGELOG.md |
| What must be host-neutral? | openspec/specs/cross-host-plugin-identity/spec.md |
| What must be content-addressed? | openspec/specs/immutable-skill-supply-chain/spec.md |
| What did 0.2.0 change? | commits `75864d3` (docs) + `acbd5ea` (fix + bump), not yet in CHANGELOG.md |
| What gates keep the repo clean? | `tests/skills.test.mjs` (added in `f0e98d6`) + `tests/distribution.test.mjs` (rewritten in `acbd5ea`) |
| What OpenSpec changes are pending? | `openspec/changes/2026-09-21-*/` (6 proposals, all `openspec validate --strict` clean) |

## Validation evidence for this survey

This file's claims were verified against the actual repo state on 2026-09-22. Spot-checks:

- All version references (0.1.0 / 0.1.5 / 0.2.0) match `git tag`, `git log`, and `package.json` / manifest contents at the time of writing.
- All path references (`src/cli.mjs`, `schemas/video_job.schema.json`, `tests/skills.test.mjs`, etc.) were read from the working tree, not memorised.
- `python3 scripts/vendor/skill_vendor.py check --offline` returns green; `node --test tests/*.test.mjs` returns 84/85 (one failure is the documented `video-factory-recover` drift caught by the new gate).
- `openspec validate --changes --strict` returns 6/6 passing.

## Note on the 5 vendored skills

`video-factory-use`, `video-factory-plan`, `video-factory-run`, `video-factory-judge`, and `video-factory-recover` are not part of this survey because they live in `full-aigc-skills/video-factory-skills` @ `v1.0.1` (sha `6077533c5dd9c5089998e07c557f6a2d5f6c2203`) and are vendored into this repo as immutable content; they're a different document scope (the agent runtime reads them, not the maintainer) and the docs above are what a maintainer or integrator reads. They are documented in `skills.lock.json` and protected by the `immutable-skill-supply-chain` spec covered in §6 above.
