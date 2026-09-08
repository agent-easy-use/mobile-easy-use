import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EVIDENCE_PREFIX = '@@MOBILE_EVIDENCE@@';

export function collectEvidenceLog(evidenceByAction, text) {
  const record = parseEvidenceRecord(text);
  if (record === null) return;

  const payload = record.payload;
  if (payload === null || typeof payload !== 'object'
      || typeof payload.actionDescription !== 'string'
      || payload.actionDescription.length === 0) {
    return;
  }

  let evidence = evidenceByAction.get(payload.actionDescription);
  if (evidence === undefined) {
    evidence = {
      actionDescription: payload.actionDescription,
      chain: [],
      ui: {},
      state: {},
    };
    evidenceByAction.set(payload.actionDescription, evidence);
  }
  if (record.category === 'chain') {
    const { actionDescription: _actionDescription, ...chainRecord } = payload;
    evidence.chain.push(chainRecord);
  } else if (record.category === 'state') {
    collectCheckpoint(evidence.state, payload, 'path');
  } else {
    collectCheckpoint(evidence.ui, payload, 'uiKey');
  }
}

export async function writeEvidenceFiles(evidenceByAction, evidenceDirectory, createEvidenceId) {
  if (evidenceByAction.size === 0) return [];

  await mkdir(evidenceDirectory, { recursive: true });
  const evidenceResults = [];
  for (const [actionDescription, evidence] of evidenceByAction) {
    const evidencePath = join(evidenceDirectory, `${createEvidenceId()}.json`);
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    evidenceResults.push({ actionDescription, evidencePath });
  }
  return evidenceResults;
}

function parseEvidenceRecord(text) {
  if (typeof text !== 'string' || !text.startsWith(EVIDENCE_PREFIX)) return null;

  try {
    const record = JSON.parse(text.slice(EVIDENCE_PREFIX.length));
    if (record === null || typeof record !== 'object'
        || !['chain', 'state', 'ui'].includes(record.category)
        || !Object.hasOwn(record, 'payload')) {
      return null;
    }
    return { category: record.category, payload: record.payload };
  } catch {
    return null;
  }
}

function collectCheckpoint(target, payload, keyName) {
  const key = payload[keyName];
  if (typeof key !== 'string' || key.length === 0
      || !['before', 'after'].includes(payload.checkpoint)) {
    return;
  }

  let entry = Object.hasOwn(target, key) ? target[key] : undefined;
  if (entry === undefined) {
    entry = {
      ...(keyName === 'path' ? { path: payload.path } : { className: null }),
      ...(keyName === 'uiKey' ? { before: null, after: null } : {}),
    };
    Object.defineProperty(target, key, {
      value: entry,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (keyName === 'uiKey' && payload.className != null) {
    entry.className = payload.className;
  }
  if (keyName === 'path' && typeof payload.error === 'string') {
    delete entry[payload.checkpoint];
    (entry.errors ??= {})[payload.checkpoint] = payload.error;
    return;
  }
  if (!Object.hasOwn(payload, 'value')) return;
  entry[payload.checkpoint] = payload.value;
  if (keyName === 'path' && entry.errors) {
    delete entry.errors[payload.checkpoint];
    if (Object.keys(entry.errors).length === 0) delete entry.errors;
  }
}
