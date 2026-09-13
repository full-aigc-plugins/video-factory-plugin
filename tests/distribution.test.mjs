import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_SKILLS = [
  'codex-video-factory-judge',
  'codex-video-factory-plan',
  'codex-video-factory-recover',
  'codex-video-factory-run',
  'codex-video-factory-use',
  'video-shots',
  'video-sync',
];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('distribution exposes the approved plugin identity and seven skills', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'codex-video-factory');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills, './skills/');
  const skills = readdirSync('skills').filter((name) => statSync(`skills/${name}`).isDirectory()).sort();
  assert.deepEqual(skills, EXPECTED_SKILLS);
});

test('runtime has zero npm dependencies and an executable CLI', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies ?? {}, {});
  accessSync('bin/video-factory', constants.X_OK);
});

test('repository marketplace points at the public main branch', () => {
  const market = readJson('.agents/plugins/marketplace.json');
  assert.equal(market.name, 'partme-ai-video-factory');
  assert.deepEqual(market.plugins[0].source, {
    source: 'url',
    url: 'https://github.com/partme-ai/codex-video-factory-plugin.git',
    ref: 'main',
  });
});

test('GitHub CI verifies the supported Node floor and current runtime', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /node-version: \[18, 24\]/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /apt-get install -y ffmpeg/);
  assert.match(workflow, /command -v ffmpeg/);
  assert.match(workflow, /git diff --exit-code -- skills\/video-shots skills\/video-sync/);
});
