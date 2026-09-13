import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchemaInstance } from './schema-lite.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JOB_SCHEMA = JSON.parse(readFileSync(join(ROOT, 'schemas', 'video_job.schema.json'), 'utf8'));

const TRANSITIONS = {
  AwaitingApproval: ['Running', 'Blocked'],
  Running: ['Partial', 'Collecting', 'Blocked', 'Failed'],
  Partial: ['Running', 'Failed'],
  Blocked: ['Running', 'Failed'],
  Collecting: ['Verifying', 'Failed'],
  Verifying: ['ReviewReady', 'Failed'],
  ReviewReady: ['Completed', 'ReworkReady'],
  ReworkReady: [], Completed: [], Failed: [],
};

export function newJob({ id, planHash, stage, shotIds }) {
  return { schemaVersion: '1.0.0', id, revision: 1, state: 'AwaitingApproval', planHash, stage, segments: shotIds.map((id) => ({ id, state: 'Pending', attempts: 0 })), history: [] };
}

export function transition(job, next, note = '') {
  if (!(TRANSITIONS[job.state] ?? []).includes(next)) throw new Error(`illegal transition: ${job.state} -> ${next}`);
  return { ...job, revision: job.revision + 1, state: next, history: [...job.history, { from: job.state, to: next, note }] };
}

export function markSegment(job, id, receipt, { attempts = 1, reused = false } = {}) {
  return { ...job, revision: job.revision + 1, segments: job.segments.map((segment) => segment.id === id ? { ...segment, state: 'Completed', attempts: segment.attempts + attempts, reused, receipt } : segment) };
}

export function failSegment(job, id, error) {
  if (!job.segments.some((segment) => segment.id === id)) throw new Error(`unknown segment: ${id}`);
  const failure = { message: String(error?.message ?? error).slice(0, 1000) };
  if (error?.code) failure.code = String(error.code).slice(0, 100);
  return {
    ...job,
    revision: job.revision + 1,
    segments: job.segments.map((segment) => segment.id === id
      ? { ...segment, state: 'Failed', attempts: segment.attempts + 1, error: failure }
      : segment),
  };
}

export const pendingSegments = (job) => job.segments.filter((segment) => segment.state === 'Pending').map((segment) => segment.id);

export function recordHumanDecision(job, decision, note = '') {
  if (job.state !== 'ReviewReady') throw new Error('human decision requires ReviewReady state');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('human decision must be approved or rejected');
  const target = decision === 'approved' ? 'Completed' : 'ReworkReady';
  const transitioned = transition(job, target, `human ${decision}`);
  const advisoryFailed = (job.scores?.gates ?? []).some((gate) => gate.status === 'FAIL' && !(job.scores?.failedRequired ?? []).includes(gate.id));
  return {
    ...transitioned,
    revision: transitioned.revision + 1,
    review: { decision, note: String(note).slice(0, 2000) },
    scores: job.scores ? {
      ...job.scores,
      humanLabel: decision,
      decision: decision === 'rejected' ? 'fail' : advisoryFailed ? 'review' : 'pass',
    } : undefined,
  };
}

const rejectSecrets = (value) => {
  const text = JSON.stringify(value);
  if (/"(?:api[_-]?key|token|password|secret)"\s*:/i.test(text)) throw new Error('credential field is not allowed');
};

const validateJob = (job) => {
  const issues = validateSchemaInstance(JOB_SCHEMA, job);
  if (issues.length) throw new Error(`${issues[0].path}: ${issues[0].message}`);
};

export function writeLedger(path, job) {
  rejectSecrets(job);
  validateJob(job);
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${job.id}.${process.pid}.tmp`);
  const fd = openSync(temp, 'w', 0o600);
  try { writeFileSync(fd, `${JSON.stringify(job, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}

export function readLedger(path) {
  const job = JSON.parse(readFileSync(path, 'utf8'));
  rejectSecrets(job);
  validateJob(job);
  return job;
}
