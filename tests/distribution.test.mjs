import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_SKILLS = [
  'video-episode-slicing',
  'video-factory-harness',
  'video-factory-judge',
  'video-factory-plan',
  'video-factory-recover',
  'video-factory-run',
  'video-factory-use',
  'video-shots',
  'video-sync',
];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('distribution exposes the approved plugin identity and nine skills', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'video-factory');
  // The resolved version is owned by the marketplace catalog and validated by
  // sync-marketplaces; asserting a literal here would break every release bump.
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/);
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

test('every manifest and the repository marketplace agree on one released version', () => {
  const version = readJson('.zcode-plugin/plugin.json').version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(readJson('kimi.plugin.json').version, version);
  const codex = readJson('.codex-plugin/plugin.json').version;
  assert.ok(codex === version || codex.startsWith(`${version}+`), `codex manifest ${codex} does not describe ${version}`);
  const market = readJson('.agents/plugins/marketplace.json');
  assert.equal(market.name, 'partme-ai-video-factory');
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].version, version);
  assert.deepEqual(market.plugins[0].source, {
    source: 'url',
    url: 'https://github.com/full-aigc-plugins/video-factory-plugin.git',
    ref: `v${version}`,
  });
  // Both release-pinned CDN URLs must move with the version or the marketplace install 404s.
  const pinned = `https://cdn.jsdelivr.net/gh/full-aigc-plugins/video-factory-plugin@v${version}/`;
  assert.ok(market.plugins[0].icon.startsWith(pinned), market.plugins[0].icon);
  assert.ok(market.plugins[0].interface.logo.startsWith(pinned), market.plugins[0].interface.logo);
});

test('GitHub CI verifies the supported Node floor and current runtime', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /node-version: \[18, 24\]/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /apt-get install -y ffmpeg/);
  assert.match(workflow, /command -v ffmpeg/);
  assert.match(workflow, /git diff --exit-code -- skills\/video-shots skills\/video-sync/);
});
