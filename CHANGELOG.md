# Changelog

## 0.4.0 - 2026-09-23

- Connected the semantic score to the round snapshot: `evaluate --semantic-evidence` now writes an `<artifact>.semantic.json` summary side file (total score, gap dimension/frame pairs, gap fingerprint, target + score-file hashes), and `accept` attaches it to the round snapshot. Regression and stagnation detection now see real scores instead of always firing with `NO_SCORE` — the 0.3.0 pipeline was previously inert in the real flow.
- `rounds` now accepts several ledgers in round order (`rounds r1.json r2.json ...`) and aggregates their snapshots, since one ledger holds at most one completed round; cross-round regression/stagnation now actually triggers. Stagnation output ends with the escalation path (`accept --decision rejected` → `ReworkReady`, no automatic retry).
- Human-decision synthesis now mirrors `evaluateMedia`: approving a job with an unverified (`NOT_RUN`) required gate records `review`, not `pass` — an approval can no longer launder a missing check into a pass.
- Round snapshots carry `targetSha256` and `scoreFileSha256` so a judgment is traceable to the exact score file and target image (additive schema fields).
- Marketplace catalog resynchronized (it lagged at 0.3.1 while manifests read 0.3.2); 105/105 Node tests, 8/8 strict OpenSpec validations.

## 0.3.2 - 2026-09-23

- Select authenticated skill-source reads by repository owner: `full-aigc-skills` and `full-stack-skills` use separate, least-privilege environment tokens while unknown public owners remain anonymous.
- Keep credentials out of command arguments, lockfiles, snapshots, logs, and persistent Git remotes by using a temporary `GIT_ASKPASS` transport with output redaction.
- Fail explicitly when an owner is configured to require authentication but its token is unavailable; offline integrity checks remain credential-free.
- Added seven credential-routing and secret-hygiene regression tests; the complete release gate passes 18/18 Python tests, 101/101 Node tests, online/offline vendor checks, and 8/8 strict OpenSpec validations.

## 0.3.1 - 2026-09-23

- Vendored `video-factory-skills` v1.0.2 and restored the recovery review gate in `video-factory-recover` (the `ReviewReady` omission flagged in the 0.3.0 notes is fixed upstream and re-synced here).
- Synchronized all plugin version surfaces. Note: the marketplace catalog for this release was left at the previous version; corrected retroactively in 0.4.0.

## 0.3.0 - 2026-09-22

- `evaluate --target <image> --emit-evidence <dir>` emits a hashed evidence package (target + per-shot S##a/S##b frames + semantic-evidence.json) for the host agent to read; `--semantic-evidence <score.json>` validates a host-agent four-dimension rubric score (Composition/Lighting/Materials/Details, 0-3-3-3-1) and populates the `semanticConsistency` advisory gate. The CLI never calls a model, reads a credential, or makes a network request.
- New `rounds` command and `src/round-snapshot.mjs`: per-round snapshots (score, gate digest, gap fingerprint) recorded at `accept`; regression detection (current < previous total); stagnation detection (best score unimproved for 2 rounds, or same gap fingerprint 2 rounds running). Advisory only — never auto-advances state, never auto-retries.
- `skills/video-factory-harness/SKILL.md` gains §3a (semantic gate discipline), §3b (round-loop discipline), §3c (asset-sourcing ladder discipline).
- `THIRD_PARTY_NOTICES.md` records the dream-loop (MIT) rubric provenance.
- 101 tests / 100 pass; the one failure is the documented `video-factory-recover` omission of `ReviewReady` (upstream item, tracked in change 5 §7.x).

## 0.2.0 - 2026-09-21

- Fixed `evaluate` always returning `fail`: collapsed `undefined` evidence and explicit `false` were both passed to the required gates as `false`, so the documented judge entry could not return `pass` or `review`. Three-state gates now distinguish `NOT_RUN` (could not check) from `FAIL` (checked and inconsistent).
- Derived the timeline gate from the plan inside `evaluate`, so it holds without a ledger; provenance remains verifiable only when a job ledger is supplied via `--ledger`.
- `--skip-detectors` marks the affected media gates `SKIPPED` rather than leaving them `NOT_RUN`, with the decision capped at `review` so model scores cannot advance state.
- `evaluate` now invokes `analyzeMedia` + `analyzeEditPolicy` so the seven advisory gates with producers (blackFrames, freezeFrames, silence, subtitleTiming, avSync, duplicateShots, rhythm) are populated instead of all `NOT_RUN`.
- `segment-renderer` carries the `provenanceOk`/`timelineOk` flags verified on the temp file through the atomic rename, so segment receipts remain valid against the schema that requires those booleans.
- `bin/video-factory evaluate <artifact> <plan>` now returns `review` (with retrieval guidance for the still-unverifiable provenance gate) on a technically-correct artifact instead of `fail`.
- 85 tests / 84 pass; the one failing test is the documented drift caught by the new gate (`video-factory-recover` describes states but omits `ReviewReady`) and is tracked in `openspec/changes/2026-09-21-repair-skill-reference-integrity/tasks.md` §7.x.
- 6 OpenSpec change proposals introduced; all pass `openspec validate --changes --strict`.

## 0.1.5 - 2026-09-20

- Replaced Codex-first public branding with host-neutral Video Factory identity in documentation and release artwork.
- Retained explicit Codex, ZCode, and Kimi names only for host-specific installation and manifest contracts.
- Added a regression gate for obsolete host-prefixed public product naming; runtime behavior is unchanged.

## 0.1.0 - 2026-09-14

- Vendored original `video-shots` and `video-sync` Skills at ReelBench commit
  `75520c7b32ab5af8b22c5e4f79705efbbc0d8e07`, protected by Git Blob and SHA-256 locks.
- Added local shot evidence, automatic EditDecision validation, rough/final quotes and approvals.
- Added resumable content-addressed FFmpeg rendering, hard cuts, fades, dissolves and image camera motion.
- Added synchronized review receipts, multi-track final audio, embedded subtitles, watermark and three aspects.
- Added closed schemas, atomic ledgers, missing-asset handoffs, cross-plugin receipts and explicit human acceptance.
- Added required media gates and policy checks for black/freeze/silence/subtitles/AV offset/duplicates/rhythm.

No external video generation API, API key, npm runtime dependency, or automatic retry is included.
