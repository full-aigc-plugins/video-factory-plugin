import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchemaInstance } from './schema-lite.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const readSchema = (name) => JSON.parse(readFileSync(join(ROOT, 'schemas', `${name}.schema.json`), 'utf8'));
const VIDEO_PLAN_SCHEMA = readSchema('video_plan');
const EDIT_DECISION_SCHEMA = readSchema('edit_decision');

const ordered = (value) => {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  return value;
};

export function canonicalHash(value) {
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}

export function validateVideoPlan(plan) {
  if (plan.mode !== 'local_composition') throw new Error('only local_composition is available');
  const issues = [
    ...validateSchemaInstance(VIDEO_PLAN_SCHEMA, plan),
    ...validateSchemaInstance(EDIT_DECISION_SCHEMA, plan.editDecision, '$.editDecision'),
  ];
  if (issues.length) throw new Error(`${issues[0].path}: ${issues[0].message}`);
  if (!Number.isInteger(plan.round) || plan.round < 1) throw new Error('invalid round');
  if (!plan.editDecision || !Array.isArray(plan.assets) || !plan.assets.length) throw new Error('plan requires editDecision and assets');
  const { width, height, fps } = plan.output ?? {};
  if (![width, height].every((x) => Number.isInteger(x) && x > 0 && x % 2 === 0)) throw new Error('output dimensions must be positive even integers');
  if (!Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error('invalid output fps');
  const assets = new Map(plan.assets.map((asset) => [asset.id, asset]));
  if (assets.size !== plan.assets.length) throw new Error('duplicate asset id');
  if (plan.output.audioAssetId && plan.output.audioTracks?.length) throw new Error('use audioAssetId or audioTracks, not both');
  for (const [field, kind] of [['audioAssetId', 'audio'], ['subtitleAssetId', 'subtitle'], ['watermarkAssetId', 'image']]) {
    const id = plan.output?.[field];
    if (id && assets.get(id)?.kind !== kind) throw new Error(`${field} must reference a ${kind} asset`);
  }
  for (const track of plan.output?.audioTracks ?? []) {
    if (assets.get(track.assetId)?.kind !== 'audio') throw new Error(`audio track ${track.assetId} must reference an audio asset`);
  }
  return plan;
}
