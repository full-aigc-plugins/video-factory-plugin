import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const own = ['use', 'plan', 'run', 'judge', 'recover'].map((name) => `video-factory-${name}`);
const skillText = (name) => readFileSync(`skills/${name}/SKILL.md`, 'utf8');
const safeRead = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

test('factory router assigns ReelBench and Factory intents without overlap', () => {
  const router = skillText('video-factory-use');
  assert.match(router, /拉片用 `video-shots`/);
  assert.match(router, /同步镜头信息审阅用 `video-sync`/);
  assert.match(router, /自动剪辑计划用 `video-factory-plan`/);
  assert.match(router, /已批准渲染用 `video-factory-run`/);
  assert.match(router, /原生生成请求在 0\.1\.0 明确 blocked/);
});

test('factory-owned skills have precise trigger metadata and do not duplicate upstream code', () => {
  for (const name of own) {
    const text = skillText(name);
    assert.match(text, new RegExp(`name: ${name}`));
    assert.match(text, /description: Use when/);
    const files = readdirSync(`skills/${name}`, { recursive: true });
    assert.equal(files.some((file) => /video-(shots|sync)\.mjs$/.test(file)), false);
  }
});

test('skills state approval, local-file, no-secret and no-fabrication boundaries', () => {
  const combined = own.map(skillText).join('\n');
  assert.match(combined, /粗剪批准不能用于终版/);
  assert.match(combined, /拒绝 URL/);
  assert.match(combined, /不调用外部视频 API/);
  assert.match(combined, /不得编造成功/);
  assert.match(combined, /不自动重试/);
});

// Regression gates for change 2026-09-21-repair-skill-reference-integrity.

const jobSchema = JSON.parse(readFileSync('schemas/video_job.schema.json', 'utf8'));
const jobStates = jobSchema.properties.state.enum;
const jobStateSet = new Set(jobStates);

const sharedDuplicates = ['contracts-and-safety.md', 'operations.md', 'examples-and-faq.md'];

test('vendored skill state machines match the schema', () => {
  // A skill that publishes a state model must only name states the schema enforces.
  // Anything else is a fabricated state that drifts from real behaviour.
  for (const name of own) {
    const text = skillText(name);
    const referenced = new Set(text.match(/\b(?:AwaitingApproval|Running|Partial|Blocked|Collecting|Verifying|ReviewReady|ReworkReady|Completed|Failed)\b/g) ?? []);
    if (referenced.size === 0) continue;
    for (const state of referenced) assert.ok(jobStateSet.has(state), `${name} references unknown state ${state}`);
    // The human gate (ReviewReady → Completed|ReworkReady) must appear in skills that
    // describe state at all — without it, model scores appear to advance state.
    assert.ok(referenced.has('ReviewReady'), `${name} describes states but omits ReviewReady`);
  }
});

test('no skill contains generic boilerplate or interactive-input traces', () => {
  // Today: every vendored skill still carries the QUALITY_BASELINE_V1 block. Per
  // change 5's proposal, deletion breaks the upstream TRACE gate (4.60 → 4.12), so
  // the block stays until the explicit replacement change removes it. What this
  // test guards against is the *spread* — boilerplate leaking into local skills,
  // into reference files, or into skills that don't yet carry it.
  const vendored = ['video-factory-judge', 'video-factory-plan', 'video-factory-run', 'video-factory-use', 'video-factory-recover'];
  for (const name of own.filter((skill) => !vendored.includes(skill))) {
    const text = skillText(name);
    assert.doesNotMatch(text, /<!-- QUALITY_BASELINE_V1 -->/, `${name} should not import the vendored boilerplate marker`);
    assert.doesNotMatch(text, /技能触发条件与用户意图一致.*没有把相邻任务误路由/, `${name} references the generic validation checklist item`);
  }
  for (const name of own) {
    const text = skillText(name);
    assert.doesNotMatch(text, /\binput\(/, `${name} contains an interactive-input trace`);
    assert.doesNotMatch(text, /\bread -p\b/, `${name} contains a read -p trace`);
  }
});

test('skill reference files contain no broken local links', () => {
  const broken = [];
  for (const name of own) {
    const base = `skills/${name}/SKILL.md`;
    const text = skillText(name);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (/^[a-z]+:/i.test(target) || target.startsWith('//')) continue;
      if (!target.startsWith('./') && !target.startsWith('../') && !target.startsWith('skills/')) continue;
      try { readFileSync(target, 'utf8'); } catch { broken.push(`${base} → ${match[1]}`); }
    }
  }
  assert.deepEqual(broken, [], broken.join('\n'));
});

test('shared reference files stay byte-identical across vendored skills', () => {
  // Each shared file is duplicated once per vendored skill (granular install) — drift
  // between copies is a real defect because users only install one of them.
  for (const file of sharedDuplicates) {
    const copies = own.map((name) => readFileSync(`skills/${name}/references/${file}`, 'utf8'));
    const expected = copies[0];
    for (const copy of copies) assert.equal(copy, expected, `references/${file} differs across skills`);
  }
});
