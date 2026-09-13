import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { sha256File } from './hash.mjs';

export function resolveGrantedFile(root, candidate) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) throw new Error('input must be a local file');
  const base = realpathSync(root);
  const unresolved = isAbsolute(candidate) ? candidate : resolve(base, candidate);
  const stat = lstatSync(unresolved);
  if (stat.isSymbolicLink()) throw new Error('symlink inputs are not allowed');
  if (!stat.isFile()) throw new Error('input must be a local regular file');
  const actual = realpathSync(unresolved);
  const rel = relative(base, actual);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('input is outside input root');
  return actual;
}

export async function registerAssets(assets, root) {
  const result = {};
  for (const asset of assets) {
    const path = resolveGrantedFile(root, asset.path);
    const actual = await sha256File(path);
    if (actual !== asset.sha256) throw new Error(`asset hash mismatch: ${asset.id}`);
    result[asset.id] = { ...asset, path };
  }
  return result;
}

export function missingAssetRequirements(required, registered) {
  return required.filter((item) => !registered[item.id]).map((item) => ({
    id: item.id,
    kind: item.kind,
    capability: item.kind === 'image' ? 'image.batch' : item.kind === 'animation' ? 'blender.animation' : 'user.asset',
  }));
}
