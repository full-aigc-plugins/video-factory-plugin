// Semantic-evidence emission and intake for the semanticConsistency advisory gate.
// All operations are deterministic: no model calls, no network, no credentials read.
// Reuses the vendored video-shots CLI for shot boundaries; emits a manifest + frames
// the host agent can read with vision input, and validates the host-agent-supplied
// scoring file against the emitted manifest.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchemaInstance } from './schema-lite.mjs';
import { gapFingerprint } from './round-snapshot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_SCRIPT = join(ROOT, 'skills/video-shots/scripts/video-shots.mjs');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'schemas/semantic_evidence.schema.json'), 'utf8'));

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const probeImageSize = (path) => {
  // Probe only — never transcode.
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-print_format', 'json', path,
  ], { encoding: 'utf8', maxBuffer: 1 << 20 });
  if (result.status !== 0) return null;
  try {
    const stream = JSON.parse(result.stdout).streams?.[0] ?? {};
    return { width: Number(stream.width), height: Number(stream.height) };
  } catch { return null; }
};

const spawnShots = (args) => spawnSync('node', [SHOTS_SCRIPT, ...args], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28,
});

const slugifyShot = (raw) => {
  const trimmed = String(raw).replace(/\.json$/i, '');
  return basename(trimmed);
};

// Public API

export function evidenceSchemaPath() {
  return join(ROOT, 'schemas/semantic_evidence.schema.json');
}

// Emit an evidence package: target image + per-shot start/end frames + a hashed manifest.
// Reuses video-shots.mjs for shot boundaries; never invokes any model or network API.
export function emitEvidence({ artifact, target, outputDir }) {
  if (!existsSync(artifact)) throw new Error(`artifact not found: ${artifact}`);
  if (!existsSync(target)) throw new Error(`target reference image required; provide --target <image>: ${target}`);
  const out = resolve(outputDir);
  mkdirSync(out, { recursive: true });
  const shotsPath = join(out, 'shots.json');
  const framesDir = join(out, 'frames');
  mkdirSync(framesDir, { recursive: true });

  // Run video-shots seed → frames against the artifact. The vendored script reads
  // argv only and never makes network calls.
  const seedResult = spawnShots(['seed', artifact, '--track', join(out, 'track.json'), '--title', basename(artifact)]);
  if (seedResult.status !== 0) throw new Error(`video-shots seed failed (exit ${seedResult.status}): ${seedResult.stderr ?? ''}`);
  writeFileSync(shotsPath, seedResult.stdout ?? '');

  const framesResult = spawnShots(['frames', shotsPath, '--video', artifact, '--dir', framesDir]);
  if (framesResult.status !== 0) throw new Error(`video-shots frames failed (exit ${framesResult.status}): ${framesResult.stderr ?? ''}`);

  // Build manifest of frame files. Filter out non-frame junk; the script writes only jpgs.
  const manifest = collectManifest({ artifact, target, outputDir: out, framesDir, shotsPath });

  const manifestPath = join(out, 'semantic-evidence.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath, manifest };
}

// Build a SemanticEvidence-shaped object suitable for host-agent consumption.
// The host agent later fills `score` and `gaps` and writes the file back via write-back.
export function buildEmptyScore(manifest) {
  return {
    schemaVersion: '1.0.0',
    target: { ...manifest.target },
    frames: manifest.frames.map((entry) => ({ id: entry.id, path: entry.path, sha256: entry.sha256, kind: entry.kind })),
    score: { composition: 0, lighting: 0, materials: 0, details: 0, total: 0 },
    gaps: [],
  };
}

const collectManifest = ({ artifact, target, outputDir, framesDir, shotsPath }) => {
  const targetSize = probeImageSize(target) ?? { width: 0, height: 0 };
  const targetSha = sha256File(target);
  const frames = [{ id: 'target', path: relative(outputDir, target), sha256: targetSha, kind: 'target', bytes: readFileSync(target).byteLength }];

  // Shots.json contains one entry per shot. Read it and pair with files emitted by the frames step.
  let shots;
  try { shots = JSON.parse(readFileSync(shotsPath, 'utf8')); } catch { shots = { shots: [] }; }
  const shotsList = Array.isArray(shots.shots) ? shots.shots : [];

  // Per-shot frames are written as S01a.jpg / S01b.jpg (or S01.jpg if --single).
  const indexed = new Map();
  for (const name of readdirSync(framesDir)) {
    const match = name.match(/^(S\d+)([ab])?\.jpg$/i);
    if (!match) continue;
    const id = `${match[1]}${match[2] ?? ''}`;
    indexed.set(id, name);
  }
  for (const shot of shotsList) {
    const slug = slugifyShot(shot.id ?? '');
    if (!slug) continue;
    for (const suffix of ['a', 'b']) {
      const key = `${slug}${suffix}`;
      const file = indexed.get(key);
      if (!file) continue;
      const fullPath = join(framesDir, file);
      frames.push({
        id: key,
        path: relative(outputDir, fullPath),
        sha256: sha256File(fullPath),
        kind: suffix === 'a' ? 'shot-start' : 'shot-end',
        bytes: readFileSync(fullPath).byteLength,
      });
    }
  }

  const artifactSha = sha256File(artifact);
  const artifactSize = readFileSync(artifact).byteLength;

  return {
    schemaVersion: '1.0.0',
    artifact: { path: relative(outputDir, artifact) ?? basename(artifact), sha256: artifactSha, bytes: artifactSize },
    target: { path: relative(outputDir, target), sha256: targetSha, width: targetSize.width, height: targetSize.height },
    frames,
    notes: [
      'Each frame id matches the file produced by the vendored video-shots frames step.',
      'frame.id "target" is the user-supplied reference image; shot frames use the script-emitted S##a/S##b naming.',
    ],
  };
};

// Validate a host-agent-supplied scoring file against the emitted manifest.
// Returns { ok, issues, normalized }; never throws.
export function validateAndNormalize(scorePath, manifest) {
  if (!existsSync(scorePath)) return { ok: false, error: `score file not found: ${scorePath}` };
  let raw;
  try { raw = JSON.parse(readFileSync(scorePath, 'utf8')); }
  catch (error) { return { ok: false, error: `score file is not valid JSON: ${error.message}` }; }

  const issues = validateSchemaInstance(SCHEMA, raw);
  if (issues.length) return { ok: false, error: `${issues[0].path}: ${issues[1] ? '\n' + issues.slice(1).map((i) => i.path + ' ' + i.message).join('\n') : issues[0].message}` };

  // Verify score arithmetic — total must equal sum of dimensions (rounded to 1 decimal).
  const dims = ['composition', 'lighting', 'materials'];
  const expectedTotal = Math.round((dims.reduce((s, k) => s + Number(raw.score[k] ?? 0), 0) + Number(raw.score.details ?? 0)) * 10) / 10;
  if (Math.abs(Number(raw.score.total) - expectedTotal) > 0.05) {
    return { ok: false, error: `score.total (${raw.score.total}) must equal composition + lighting + materials + details (${expectedTotal})` };
  }

  // Verify evidence binding: every frame referenced in `gaps` must appear in the manifest,
  // and the target's sha256 must match the manifest's recorded target hash.
  const validFrameIds = new Set(manifest.frames.map((frame) => frame.id));
  validFrameIds.add('target');
  if (raw.target.sha256 !== manifest.target.sha256) {
    return { ok: false, error: `target.sha256 does not match the emitted evidence manifest target hash` };
  }
  for (const gap of raw.gaps ?? []) {
    if (!validFrameIds.has(gap.frame)) {
      return { ok: false, error: `gap.frame "${gap.frame}" is not present in the emitted evidence manifest` };
    }
  }
  return { ok: true, normalized: raw };
}

// Convert a validated score file to the gate status that evaluateMedia will read.
export function scoreToGateStatus(normalized) {
  // PASS when total >= 8 (matches dream-loop's "good enough" threshold);
  // FAIL otherwise. NOT_RUN is reserved for absent/errored score.
  if (!normalized) return 'NOT_RUN';
  return normalized.score.total >= 8 ? 'PASS' : 'FAIL';
}

// Persist a summary of the validated score next to the artifact (like .receipt.json),
// so `accept` can attach the real totalScore and gap fingerprint to its round snapshot
// without re-validating. Only summaries are stored, never the review prose.
export function writeSemanticSummary(artifactPath, normalized, manifest, scorePath) {
  const gaps = (normalized.gaps ?? []).map((gap) => ({ dimension: gap.dimension, frame: gap.frame }));
  const summary = {
    schemaVersion: '1.0.0',
    totalScore: normalized.score.total,
    gaps,
    gapFingerprint: gapFingerprint(gaps),
    targetSha256: manifest.target.sha256,
    scoreFileSha256: sha256File(scorePath),
    at: new Date().toISOString(),
  };
  const summaryPath = `${artifactPath}.semantic.json`;
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summaryPath;
}

// Tolerant read of the summary side file. Returns null when absent or unusable.
export function readSemanticSummary(artifactPath) {
  const summaryPath = `${artifactPath}.semantic.json`;
  if (!existsSync(summaryPath)) return null;
  try {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    if (typeof summary.totalScore !== 'number') return null;
    return summary;
  } catch { return null; }
}
