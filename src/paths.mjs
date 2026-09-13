import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { sha256File } from './hash.mjs';

export function resolveGrantedFile(root, candidate) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) throw new Error('input must be a local file');
  const base = realpathSync(root);
  const unresolved = isAbsolute(candidate) ? candidate : resolve(base, candidate);
  const unresolvedRel = relative(base, unresolved);
  if (unresolvedRel.startsWith('..') || isAbsolute(unresolvedRel)) throw new Error('input is outside input root');
  let stat;
  try {
    stat = lstatSync(unresolved);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const missing = new Error(`missing asset: ${candidate}`);
      missing.code = 'ASSET_MISSING';
      throw missing;
    }
    throw error;
  }
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
    let receipt;
    if (asset.receiptPath) {
      const receiptFile = resolveGrantedFile(root, asset.receiptPath);
      receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
      const allowed = new Set(['schemaVersion', 'source', 'path', 'sha256', 'kind', 'license', 'authorizedAt', 'artifactId']);
      const unknown = Object.keys(receipt).find((key) => !allowed.has(key));
      if (unknown) throw new Error(`unsupported receipt field: ${unknown}`);
      if (receipt.sha256 !== actual) throw new Error(`receipt hash mismatch: ${asset.id}`);
      if (receipt.kind !== asset.kind) throw new Error(`receipt kind mismatch: ${asset.id}`);
      if (asset.source && receipt.source !== asset.source) throw new Error(`receipt source mismatch: ${asset.id}`);
      if (resolveGrantedFile(root, receipt.path) !== path) throw new Error(`receipt path mismatch: ${asset.id}`);
    }
    result[asset.id] = { ...asset, path, ...(receipt ? { receipt } : {}) };
  }
  return result;
}

export function missingAssetRequirements(required, registered) {
  return required.filter((item) => !registered[item.id]).map((item) => ({
    id: item.id,
    kind: item.kind,
    capability: item.kind === 'image' ? 'image.batch' : item.kind === 'animation' || /blender/i.test(item.source ?? '') ? 'blender.animation' : 'user.asset',
  }));
}

export function findMissingAssetRequirements(assets, root) {
  const registered = {};
  for (const asset of assets) {
    try {
      resolveGrantedFile(root, asset.path);
      registered[asset.id] = true;
    } catch (error) {
      if (error?.code !== 'ASSET_MISSING') throw error;
    }
  }
  return missingAssetRequirements(assets, registered);
}

export function writeAssetRequirements(path, requirements) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.asset-requirements.${process.pid}.tmp`);
  const fd = openSync(temp, 'w', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify({ schemaVersion: '1.0.0', requirements }, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  return path;
}
