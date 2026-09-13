# Codex Video Factory Automatic Editing 0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a distributable Codex plugin that uses original ReelBench Skills for shot analysis and synchronized review, converts Codex-authored EditDecision plans into approved rough and final cuts, and produces independently verified H.264/AAC MP4 receipts.

**Architecture:** Node.js standard-library modules validate closed contracts, hash local inputs, maintain an atomic job ledger, compile bounded FFmpeg argv, render content-addressed shot segments, assemble a final video, and verify the file with ffprobe and full decode. Codex supplies plans and semantic review; deterministic code owns measurements, state transitions, approvals, and hard gates.

**Tech Stack:** Node.js 18+ ESM and built-in `node:test`, FFmpeg/ffprobe, JSON Schema Draft 2020-12 documents with a repository-owned supported-keyword validator, Codex plugin Skills, no npm runtime dependencies, no API key.

**Spec:** `docs/superpowers/specs/2026-09-14-codex-video-factory-plugin-design.md`

## Global Constraints

- Use `codex-video-factory-plugin`, `codex-video-factory`, and `video-factory` consistently across repository, plugin, package, CLI, Skill, schema, and documentation identifiers.
- Version 0.1.0 implements `local_composition` automatic editing and must reject `codex_native_generation`.
- Do not add PartMe Studio UI, Blender control, image generation, external video APIs, API keys, automatic retries, network inputs, or arbitrary FFmpeg argument passthrough.
- Require Node.js 18+, `ffmpeg`, and `ffprobe`; Chrome and local TTS are not required in 0.1.0.
- Use argv arrays with `shell: false`; canonicalize paths and enforce explicit input/work/output roots.
- Render one content-addressed segment per shot and resume only missing or invalid segments.
- Keep `PASS`, `FAIL`, `SKIPPED`, and `NOT_RUN` distinct; required gates may not be skipped.
- Preserve every prior accepted output; write JSON and media outputs atomically.
- Use TDD for every behavior change and commit after every task.
- ReelBench `video-shots` and `video-sync` are active, byte-preserved 0.1.0 Skills; native-video adapters remain out of scope.

## Target File Map

```text
.codex-plugin/plugin.json                 Codex distribution manifest
.agents/plugins/marketplace.json          URL marketplace entry
package.json                              ESM metadata and test scripts, zero dependencies
bin/video-factory                         executable CLI shim
schemas/                                  six closed public contracts
src/cli.mjs                               command routing and stable exit codes
src/schema-lite.mjs                       supported JSON Schema validation
src/plan.mjs                              plan validation and stable plan hash
src/paths.mjs                             canonical path grants and local-file policy
src/hash.mjs                              streaming SHA-256 helpers
src/probe.mjs                             non-executing capability discovery
src/quote.mjs                             deterministic local resource estimate
src/approval.mjs                          approval-to-plan binding
src/ledger.mjs                            atomic job state machine and recovery frontier
src/ffmpeg-compiler.mjs                   bounded per-shot and assembly argv compiler
src/segment-renderer.mjs                  one-attempt segment execution
src/assembler.mjs                         verified-segment final assembly
src/media-collector.mjs                   ffprobe, full decode, hashes, atomic publication
src/evaluator.mjs                         required and advisory media gates
skills/*/SKILL.md                         six active workflow Skills
tests/                                    node:test unit, contract, integration and fixtures
docs/verification/                        offline and real-runtime evidence
```

---

### Task 1: Establish the plugin distribution and zero-dependency test harness

**Files:**
- Create: `.codex-plugin/plugin.json`
- Create: `.agents/plugins/marketplace.json`
- Create: `package.json`
- Create: `bin/video-factory`
- Create: `src/cli.mjs`
- Create: `tests/distribution.test.mjs`

**Interfaces:**
- Consumes: no prior task.
- Produces: `main(argv: string[]): Promise<number>` and executable `bin/video-factory`.

- [ ] **Step 1: Write the failing distribution test**

```js
test('distribution declares only the six approved skills', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills, './skills/');
  assert.deepEqual(skillDirectories().sort(), EXPECTED_SKILLS);
  assert.equal(readJson('package.json').dependencies, undefined);
  assert.ok(mode('bin/video-factory') & 0o111);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/distribution.test.mjs`

Expected: FAIL because the manifest and executable do not exist.

- [ ] **Step 3: Add the minimal manifest, package metadata and CLI shim**

```json
{
  "name": "codex-video-factory",
  "version": "0.1.0",
  "description": "Approved, recoverable and verified local video composition for Codex",
  "author": {"name":"Full Stack Skills / PartMe.AI","url":"https://github.com/partme-ai"},
  "homepage": "https://github.com/partme-ai/codex-video-factory-plugin",
  "repository": "https://github.com/partme-ai/codex-video-factory-plugin",
  "license": "Apache-2.0",
  "keywords": ["video", "composition", "ffmpeg", "receipt", "codex"],
  "skills": "./skills/",
  "interface": {
    "displayName": "Codex Video Factory",
    "shortDescription": "Compose and verify local videos with Codex",
    "category": "Creativity",
    "capabilities": ["Interactive", "Read", "Write"]
  }
}
```

`bin/video-factory` must resolve `../src/cli.mjs`, pass `process.argv.slice(2)`, and set `process.exitCode` from `main` without invoking a shell.

- [ ] **Step 4: Run the distribution test and full test command**

Run: `npm test`

Expected: PASS with zero dependencies installed.

- [ ] **Step 5: Commit**

```bash
git add .codex-plugin .agents package.json bin src/cli.mjs tests/distribution.test.mjs
git commit -m "build: scaffold video factory distribution"
```

### Task 2: Publish closed schemas and validate their supported keyword set

**Files:**
- Create: `schemas/video_plan.schema.json`
- Create: `schemas/video_job.schema.json`
- Create: `schemas/video_approval.schema.json`
- Create: `schemas/media_artifact_receipt.schema.json`
- Create: `schemas/media_scores.schema.json`
- Create: `schemas/shot_analysis.schema.json`
- Create: `src/schema-lite.mjs`
- Create: `tests/contracts.test.mjs`
- Create: `tests/fixtures/plans/minimal-valid.json`
- Create: `tests/fixtures/plans/unknown-field.json`

**Interfaces:**
- Consumes: JSON files.
- Produces: `validateSchemaInstance(schema, value): ValidationIssue[]` and `assertSupportedSchema(schema): void`.

- [ ] **Step 1: Write failing contract tests**

```js
test('minimal local composition plan validates and unknown fields fail', () => {
  assert.deepEqual(validateSchemaInstance(planSchema, validPlan), []);
  assert.match(validateSchemaInstance(planSchema, unknownFieldPlan)[0].message, /additional property/);
});

test('every public schema is closed and uses only enforced keywords', () => {
  for (const schema of publicSchemas()) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assert.doesNotThrow(() => assertSupportedSchema(schema));
  }
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/contracts.test.mjs`

Expected: FAIL because schemas and validator are missing.

- [ ] **Step 3: Implement the exact validator subset used by the schemas**

```js
const SUPPORTED = new Set([
  '$schema', '$id', '$defs', '$ref', 'type', 'properties', 'required',
  'additionalProperties', 'items', 'enum', 'const', 'minimum', 'maximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'oneOf', 'description'
]);
```

Implement local `$ref`, objects, arrays, primitives, enums, bounds, patterns and `oneOf`. Reject a schema containing an unsupported keyword instead of silently ignoring it.

- [ ] **Step 4: Run contract tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas src/schema-lite.mjs tests/contracts.test.mjs tests/fixtures/plans
git commit -m "feat: define closed video production contracts"
```

### Task 3: Enforce local path grants, input hashes and deterministic plan identity

**Files:**
- Create: `src/paths.mjs`
- Create: `src/hash.mjs`
- Create: `src/plan.mjs`
- Create: `tests/plan.test.mjs`
- Create: `tests/fixtures/assets/red.png`

**Interfaces:**
- Consumes: `VideoPlan`, `{inputRoot, workRoot, outputRoot}`.
- Produces: `resolveGrantedFile(root, candidate): string`, `sha256File(path): Promise<string>`, `validatePlan(plan, grants): Promise<ValidatedPlan>`, `planHash(validatedPlan): string`.

- [ ] **Step 1: Write failing security and identity tests**

```js
test('plan rejects traversal, symlink escape, URL input and changed bytes', async () => {
  await assert.rejects(() => validatePlan(urlPlan, grants), /local regular file/);
  await assert.rejects(() => validatePlan(traversalPlan, grants), /outside input root/);
  await assert.rejects(() => validatePlan(symlinkPlan, grants), /symlink/);
  await assert.rejects(() => validatePlan(staleHashPlan, grants), /hash mismatch/);
});

test('plan hash is stable and changes with input bytes or shot order', async () => {
  assert.equal(planHash(a), planHash(structuredClone(a)));
  assert.notEqual(planHash(a), planHash(reordered));
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/plan.test.mjs`

Expected: FAIL because path and hash modules are missing.

- [ ] **Step 3: Implement minimal secure resolution and canonical hashing**

Use `realpath`, `lstat`, `createReadStream`, `crypto.createHash('sha256')`, sorted object keys, and UTF-8 canonical JSON. Reject devices, FIFOs, sockets and symlinks. Validate `mode === 'local_composition'`, positive shot durations, unique IDs, supported asset types and total caps.

- [ ] **Step 4: Run plan tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/paths.mjs src/hash.mjs src/plan.mjs tests/plan.test.mjs tests/fixtures/assets
git commit -m "feat: bind video plans to authorized local assets"
```

### Task 4: Probe capabilities and bind estimates to explicit approval

**Files:**
- Create: `src/probe.mjs`
- Create: `src/quote.mjs`
- Create: `src/approval.mjs`
- Create: `tests/probe-approval.test.mjs`

**Interfaces:**
- Consumes: `ValidatedPlan`, executable overrides.
- Produces: `probeCapabilities(options): CapabilityReport`, `quotePlan(plan, report): LocalQuote`, `verifyApproval(approval, quote, planHash): void`.

- [ ] **Step 1: Write failing probe and approval tests**

```js
test('probe never executes binaries and reports both required tools', () => {
  const report = probeCapabilities({ which: fakeWhich });
  assert.deepEqual(report.required.map((x) => x.name), ['ffmpeg', 'ffprobe']);
  assert.equal(executions, 0);
});

test('approval must match plan hash, round and estimate revision', () => {
  assert.throws(() => verifyApproval(staleApproval, quote, hash), /approval mismatch/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/probe-approval.test.mjs`

Expected: FAIL because the modules are missing.

- [ ] **Step 3: Implement capability discovery and deterministic quote**

The quote must return shot count, total seconds, output pixels, estimated temporary bytes, remote invocation count `0`, and `requiresApproval: true`. Capability discovery checks executable regular files without launching them. Approval contains `planHash`, `round`, `quoteRevision`, `acceptedAt` and no credentials.

- [ ] **Step 4: Run probe/approval tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/probe.mjs src/quote.mjs src/approval.mjs tests/probe-approval.test.mjs
git commit -m "feat: require approval for bounded local rendering"
```

### Task 5: Add the atomic job ledger and legal recovery frontier

**Files:**
- Create: `src/ledger.mjs`
- Create: `tests/ledger.test.mjs`

**Interfaces:**
- Consumes: validated plan, approval and prior ledger.
- Produces: `newJob(plan, approval): VideoJob`, `transition(job, next, note): VideoJob`, `markSegment(job, shotId, result): VideoJob`, `pendingSegments(job): string[]`, `readLedger(path): VideoJob`, `writeLedger(path, job): void`.

- [ ] **Step 1: Write failing state, atomicity and secret tests**

```js
test('completed segments are never pending after restart', () => {
  const restored = readLedger(writeThenRead(markSegment(job, 'S01', receipt)));
  assert.deepEqual(pendingSegments(restored), ['S02']);
});

test('illegal transitions and credential-shaped keys are rejected', () => {
  assert.throws(() => transition(job, 'Completed'), /illegal transition/);
  assert.throws(() => writeLedger(path, {...job, apiKey: 'secret'}), /credential field/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/ledger.test.mjs`

Expected: FAIL because the ledger is missing.

- [ ] **Step 3: Implement immutable revisions and atomic persistence**

Use same-directory temporary files, `fsync`, `rename`, monotonic revision, append-only history and an explicit transition table. Segment attempts increase only when a process is actually launched; `Failed` does not return to `Running` without a new round.

- [ ] **Step 4: Run ledger tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ledger.mjs tests/ledger.test.mjs
git commit -m "feat: persist recoverable video jobs"
```

### Task 6: Compile bounded FFmpeg argv for shot segments

**Files:**
- Create: `src/ffmpeg-compiler.mjs`
- Create: `tests/ffmpeg-compiler.test.mjs`

**Interfaces:**
- Consumes: one validated shot, output profile and granted asset paths.
- Produces: `compileSegment(shot, profile, destination): ProcessSpec` and `compileAssembly(segments, profile, destination): ProcessSpec`, where `ProcessSpec = {bin: string, args: string[], env: Record<string,string>}`.

- [ ] **Step 1: Write failing argv tests for every supported source type**

```js
test('still shot compiles bounded zoompan and never exposes a shell', () => {
  const spec = compileSegment(stillShot, profile, out);
  assert.equal(spec.bin, 'ffmpeg');
  assert.ok(spec.args.includes('-filter_complex'));
  assert.ok(!spec.args.join(' ').includes('http:'));
  assert.equal('shell' in spec, false);
});

test('unknown filters, codecs and transitions are rejected', () => {
  assert.throws(() => compileSegment(arbitraryFilterShot, profile, out), /unsupported/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/ffmpeg-compiler.test.mjs`

Expected: FAIL because the compiler is missing.

- [ ] **Step 3: Implement closed operator compilation**

Implement only `still`, `ken_burns`, `clip`, `title_card`, `hard_cut`, `fade`, `dissolve`, subtitle overlay and declared audio tracks. Generate filter expressions internally from bounded numbers and escaped text files; never accept a filter graph string from the plan. Normalize segment output to H.264, yuv420p, fixed fps, even dimensions and AAC/silence according to plan.

- [ ] **Step 4: Run compiler tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ffmpeg-compiler.mjs tests/ffmpeg-compiler.test.mjs
git commit -m "feat: compile bounded local video operations"
```

### Task 7: Render one-attempt content-addressed segments with receipts

**Files:**
- Create: `src/segment-renderer.mjs`
- Create: `src/media-collector.mjs`
- Create: `tests/segment-renderer.test.mjs`
- Create: `tests/fakes/fake-ffmpeg.mjs`
- Create: `tests/fakes/fake-ffprobe.mjs`

**Interfaces:**
- Consumes: `ProcessSpec`, shot id, idempotency key and ledger.
- Produces: `renderSegment(request): Promise<SegmentOutcome>`, `collectMedia(path, expected): Promise<MediaReceipt>`, `verifyReceipt(receipt): Promise<ReceiptCheck>`.

- [ ] **Step 1: Write failing execution and tamper tests**

```js
test('renderer launches once and publishes only a verified segment', async () => {
  const outcome = await renderSegment(request);
  assert.equal(outcome.attempts, 1);
  assert.equal(outcome.receipt.sha256, await sha256File(outcome.path));
});

test('success without a media file and post-collection tampering fail', async () => {
  await assert.rejects(() => renderSegment(silentSuccess), /artifact missing/);
  assert.equal((await verifyReceipt(tamperedReceipt)).ok, false);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/segment-renderer.test.mjs`

Expected: FAIL because renderer and collector are missing.

- [ ] **Step 3: Implement spawn, atomic publication and independent collection**

Use `spawn` with `{shell:false, stdio:['ignore','ignore','pipe']}`, one process per attempt, bounded stderr, timeout termination and no internal retry loop. Render to a temporary sibling, probe and fully decode it, hash it, rename atomically, then hash again. Classify missing binary, timeout, disk full, non-zero exit, missing artifact and verification failure separately.

- [ ] **Step 4: Run renderer tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/segment-renderer.mjs src/media-collector.mjs tests/segment-renderer.test.mjs tests/fakes
git commit -m "feat: render and verify atomic video segments"
```

### Task 8: Assemble final MP4 and enforce required media gates

**Files:**
- Modify: `src/ffmpeg-compiler.mjs`
- Modify: `src/media-collector.mjs`
- Create: `src/assembler.mjs`
- Create: `src/evaluator.mjs`
- Create: `tests/assembly-evaluator.test.mjs`

**Interfaces:**
- Consumes: verified segment receipts, plan and output profile.
- Produces: `assembleVideo(request): Promise<MediaReceipt>` and `evaluateMedia(plan, receipt, evidence): MediaScores`.

- [ ] **Step 1: Write failing assembly and gate tests**

```js
test('required gates reject duration, dimensions, missing audio and decode errors', () => {
  const scores = evaluateMedia(plan, badReceipt, decodeEvidence);
  assert.equal(scores.decision, 'fail');
  assert.deepEqual(scores.failedRequired.sort(), ['audio','decode','dimensions','duration']);
});

test('advisory black or freeze findings cannot silently fail artistic output', () => {
  assert.equal(evaluateMedia(plan, validReceipt, advisoryEvidence).decision, 'review');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/assembly-evaluator.test.mjs`

Expected: FAIL because final assembly and evaluator are missing.

- [ ] **Step 3: Implement concat/transition assembly and four-state gates**

Compile the final timeline only from verified segment paths. Required gates cover file/hash, ffprobe readability, full decode, video stream, duration tolerance, dimensions, fps, requested audio, continuous shot timeline and input provenance. Black, freeze, silence, duplication, rhythm and semantic consistency are `PASS|FAIL|SKIPPED|NOT_RUN` findings governed by policy; no required gate may be skipped.

- [ ] **Step 4: Run evaluator tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ffmpeg-compiler.mjs src/assembler.mjs src/media-collector.mjs src/evaluator.mjs tests/assembly-evaluator.test.mjs
git commit -m "feat: assemble and gate final video artifacts"
```

### Task 9: Orchestrate approved runs, status and explicit recovery

**Files:**
- Modify: `src/cli.mjs`
- Create: `src/orchestrator.mjs`
- Create: `tests/orchestrator-cli.test.mjs`

**Interfaces:**
- Consumes: paths to plan, approval and ledger.
- Produces: `runApproved(request): Promise<RunSummary>`, `recoverJob(request): Promise<RecoverySummary>` and CLI commands `probe`, `validate-plan`, `quote`, `run`, `status`, `verify`, `evaluate`, `inspect`, `recover`.

- [ ] **Step 1: Write failing end-to-end fake-process tests**

```js
test('resume skips valid S01 and renders only pending S02', async () => {
  const summary = await recoverJob(interruptedJob);
  assert.deepEqual(summary.launchedShots, ['S02']);
  assert.equal(summary.segmentAttempts.S01, 1);
});

test('run refuses missing or stale approval before launching ffmpeg', async () => {
  assert.equal(await main(['run', planPath]), EXIT.APPROVAL_REQUIRED);
  assert.equal(fakeLaunchCount, 0);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/orchestrator-cli.test.mjs`

Expected: FAIL because orchestration and commands are incomplete.

- [ ] **Step 3: Implement serial orchestration and stable exit codes**

Validate plan, probe, quote, verify approval, open/create ledger, render pending segments serially, assemble only when every required segment verifies, evaluate final media and persist after each transition. `recover` repeats validation and probe, then resumes the same idempotency keys; it never retries a `Failed` item unchanged. `inspect` uses ffprobe and full decode to return deterministic media facts while marking ReelBench semantic analysis `NOT_RUN`.

- [ ] **Step 4: Run CLI tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.mjs src/orchestrator.mjs tests/orchestrator-cli.test.mjs
git commit -m "feat: orchestrate approved recoverable video runs"
```

### Task 10: Add six narrow Skills and prevent ownership leakage

**Files:**
- Create: `skills/codex-video-factory-use/SKILL.md`
- Create: `skills/codex-video-factory-plan/SKILL.md`
- Create: `skills/codex-video-factory-run/SKILL.md`
- Create: `skills/codex-video-factory-judge/SKILL.md`
- Create: `skills/codex-video-factory-recover/SKILL.md`
- Create: `skills/codex-video-factory-inspect/SKILL.md`
- Create: `tests/skills.test.mjs`

**Interfaces:**
- Consumes: CLI contracts from Task 9.
- Produces: exactly six discoverable workflow Skills.

- [ ] **Step 1: Write failing inventory and boundary tests**

```js
test('skills route to CLI and forbid foreign ownership', () => {
  assert.deepEqual(skillNames(), EXPECTED_SKILLS);
  for (const text of skillBodies()) {
    assert.doesNotMatch(text, /OPENAI_API_KEY|Runway|Dreamina API|control Blender/);
    assert.match(text, /video-factory/);
  }
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/skills.test.mjs`

Expected: FAIL because Skill manifests do not exist.

- [ ] **Step 3: Write minimal progressive-disclosure Skills**

Each frontmatter description states exactly when it triggers. `use` routes only; `plan` creates closed plans; `run` quotes and requires approval; `judge` separates deterministic evidence, advisory review and human labels; `recover` maps every ledger state; `inspect` runs the real 0.1.0 ffprobe/decode inspection and clearly marks ReelBench semantic analysis `NOT_RUN`.

- [ ] **Step 4: Run Skill tests and all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills tests/skills.test.mjs
git commit -m "feat: add video factory workflow skills"
```

### Task 11: Run real FFmpeg acceptance and publish evidence-backed documentation

**Files:**
- Create: `README.md`
- Create: `README.zh-CN.md`
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `docs/guides/current-cli-recipes.zh-CN.md`
- Create: `docs/verification/offline.md`
- Create: `docs/verification/runtime.md`
- Create: `tests/runtime-smoke.test.mjs`
- Modify: `tests/distribution.test.mjs`

**Interfaces:**
- Consumes: complete 0.1.0 CLI and local FFmpeg/ffprobe.
- Produces: verified sample MP4, receipts, documented installation and explicit capability boundaries.

- [ ] **Step 1: Write a failing runtime smoke test**

```js
test('two generated PNG fixtures become a verified silent MP4', async () => {
  const result = await runApproved({
    planPath: 'tests/fixtures/runtime/two-stills-plan.json',
    approvalPath: 'tests/fixtures/runtime/two-stills-approval.json',
    ledgerPath: join(tmp, 'job.json'),
    inputRoot: resolve('tests/fixtures/runtime'),
    workRoot: join(tmp, 'work'),
    outputRoot: join(tmp, 'output')
  });
  assert.equal(result.scores.decision, 'pass');
  assert.match(result.receipt.container, /mp4/);
  assert.equal(await verifyReceipt(result.receipt).then((x) => x.ok), true);
});
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `node --test tests/runtime-smoke.test.mjs`

Expected: FAIL until fixtures, executable discovery and runtime evidence path are complete.

- [ ] **Step 3: Complete documentation and runtime fixtures without overstating evidence**

Document Node/FFmpeg prerequisites, plan creation, quote, approval, run, status, recovery, verify and evaluate. State that 0.1.0 performs local composition, not native AI video generation. Record exact commands, tool versions, output SHA-256, duration, dimensions, streams, gate states and human playback status in `runtime.md`; use `NOT_RUN` for any gate not executed.

- [ ] **Step 4: Run every completion gate**

```bash
npm test
node bin/video-factory probe
node bin/video-factory validate-plan tests/fixtures/runtime/two-stills-plan.json
node bin/video-factory quote tests/fixtures/runtime/two-stills-plan.json
git diff --check
```

Expected: all commands exit 0, the test summary has zero failures, the distribution contains exactly six Skills, and runtime evidence links to verifying receipts.

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md LICENSE NOTICE docs tests/runtime-smoke.test.mjs tests/fixtures/runtime tests/distribution.test.mjs
git commit -m "docs: verify video factory 0.1.0"
```

## 0.1.0 Completion Gate

- [ ] Every public schema is closed, versioned and enforced by the supported-keyword validator.
- [ ] All local inputs are regular files inside grants and bound to the plan by SHA-256.
- [ ] Quote and approval bind the exact plan hash, round and estimate revision.
- [ ] Segment rendering is serial, one-attempt, atomic and resumable without duplicating valid segments.
- [ ] Final assembly consumes only verified segments and preserves previous accepted artifacts.
- [ ] Required media gates actually run; no required result is `SKIPPED` or `NOT_RUN`.
- [ ] Six active Skills route to the real CLI and do not claim Studio, Blender, image or provider ownership.
- [ ] Unit, contract, fake-process and real FFmpeg smoke tests pass with zero npm dependencies.
- [ ] Runtime evidence includes a real MP4, independent receipt verification and human playback observation.
- [ ] No external API, API key, network input, arbitrary shell or automatic retry exists in active code.

## Execution Order

```mermaid
flowchart LR
    T1[Distribution] --> T2[Schemas]
    T2 --> T3[Paths and Plan Hash]
    T3 --> T4[Probe Quote Approval]
    T4 --> T5[Ledger]
    T5 --> T6[FFmpeg Compiler]
    T6 --> T7[Segment Renderer]
    T7 --> T8[Assembly and Gates]
    T8 --> T9[Orchestrator and CLI]
    T9 --> T10[Skills]
    T10 --> T11[Runtime Acceptance]
```
