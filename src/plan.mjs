import { createHash } from 'node:crypto';

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
  if (!Number.isInteger(plan.round) || plan.round < 1) throw new Error('invalid round');
  if (!plan.editDecision || !Array.isArray(plan.assets) || !plan.assets.length) throw new Error('plan requires editDecision and assets');
  const { width, height, fps } = plan.output ?? {};
  if (![width, height].every((x) => Number.isInteger(x) && x > 0 && x % 2 === 0)) throw new Error('output dimensions must be positive even integers');
  if (!Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error('invalid output fps');
  const assets = new Map(plan.assets.map((asset) => [asset.id, asset]));
  if (assets.size !== plan.assets.length) throw new Error('duplicate asset id');
  for (const [field, kind] of [['audioAssetId', 'audio'], ['subtitleAssetId', 'subtitle']]) {
    const id = plan.output?.[field];
    if (id && assets.get(id)?.kind !== kind) throw new Error(`${field} must reference a ${kind} asset`);
  }
  return plan;
}
