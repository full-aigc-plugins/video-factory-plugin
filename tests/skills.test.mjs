import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const own = ['use', 'plan', 'run', 'judge', 'recover'].map((name) => `codex-video-factory-${name}`);
const skillText = (name) => readFileSync(`skills/${name}/SKILL.md`, 'utf8');

test('factory router assigns ReelBench and Factory intents without overlap', () => {
  const router = skillText('codex-video-factory-use');
  assert.match(router, /拉片用 `video-shots`/);
  assert.match(router, /同步镜头信息审阅用 `video-sync`/);
  assert.match(router, /自动剪辑计划用 `codex-video-factory-plan`/);
  assert.match(router, /已批准渲染用 `codex-video-factory-run`/);
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
