import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import '../config.js';

const kinds = ['terms', 'privacy'];

function readDocument(entry, kind, accountType) {
  if (!entry || typeof entry.body !== 'string' || !entry.body.trim() ||
      typeof entry.version !== 'string' || !entry.version.trim() ||
      typeof entry.approvedBy !== 'string' || !entry.approvedBy.trim() ||
      typeof entry.effectiveFrom !== 'string' || !Number.isFinite(Date.parse(entry.effectiveFrom))) {
    throw new Error(`Invalid approved signup document for ${accountType}/${kind}`);
  }
  return {
    kind,
    version: entry.version,
    body: entry.body,
    hash: createHash('sha256').update(entry.body).digest('hex'),
    effectiveFrom: new Date(entry.effectiveFrom).toISOString(),
  };
}

const filename = process.env.STARVNT_SIGNUP_DOCUMENTS_FILE;
const configured = filename ? JSON.parse(readFileSync(filename, 'utf8')) : null;
if (filename && (!configured || typeof configured !== 'object')) {
  throw new Error('The approved signup documents file must contain both account types');
}
const approved = configured && Object.fromEntries(
  ['CUSTOMER', 'VENDOR'].map(accountType => [
    accountType,
    kinds.map(kind => readDocument(configured[accountType]?.[kind], kind, accountType)),
  ]),
);

export function signupDocuments(accountType) {
  if (!['CUSTOMER', 'VENDOR'].includes(accountType)) {
    return null;
  }
  const documents = approved?.[accountType] || [];
  const now = Date.now();
  return {
    documents: documents.filter(document => Date.parse(document.effectiveFrom) <= now),
    required: Boolean(approved),
  };
}

export function checkSignupAcceptance(accountType, acceptance) {
  const { documents, required } = signupDocuments(accountType);
  if (!required) return {};
  if (documents.length !== kinds.length) {
    return { error: 'SIGNUP_DOCUMENTS_UNAVAILABLE', status: 503, message: 'Signup documents are not available yet.' };
  }
  if (acceptance?.accepted !== true) {
    return { error: 'SIGNUP_ACCEPTANCE_REQUIRED', status: 409, message: 'Review and accept the current signup documents to create an account.' };
  }
  if (!Array.isArray(acceptance.documents) || acceptance.documents.length !== documents.length ||
      documents.some(document => !acceptance.documents.some(candidate =>
        candidate?.kind === document.kind && candidate.version === document.version && candidate.hash === document.hash))) {
    return { error: 'SIGNUP_DOCUMENTS_CHANGED', status: 409, message: 'The signup documents changed. Review the current versions and try again.' };
  }
  return {
    record: {
      accountType,
      acceptedAt: new Date(),
      documents: documents.map(({ kind, version, hash }) => ({ kind, version, hash })),
    },
  };
}
