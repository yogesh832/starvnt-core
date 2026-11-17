import { createHash } from 'node:crypto';
const contentFields = ['title', 'category', 'objective', 'content', 'resources', 'videoId', 'captions', 'durationSeconds'];
export function learningContent(row, hashVersion = 2) {
  const base = Object.fromEntries(contentFields.map(key => [key, key === 'durationSeconds' ? Number(row[key] || 0) : String(row[key] || '')]));
  if (hashVersion === 1) return base;
  return { ...base, description: String(row.description || ''), difficulty: String(row.difficulty || ''), featured: row.featured === true, needsTags: [...new Set(Array.isArray(row.needsTags) ? row.needsTags.map(String) : [])].sort() };
}
export const learningContentHash = (row, hashVersion = 2) => createHash('sha256').update(JSON.stringify(learningContent(row, hashVersion))).digest('hex');
const fail = () => Object.assign(new Error('Lesson content history requires review before editing.'), { code: 'LESSON_CONTENT_HISTORY_CONFLICT', status: 409 });
export function learningContentSnapshot(row, { version, actor, provenance = 'CAPTURED_ON_SAVE', at = new Date() }) {
  return { version, hashVersion: 2, content: learningContent(row), hash: learningContentHash(row), actor: String(actor), capturedAt: at, provenance };
}
export function assertLearningContentHistory(previous) {
  const version = previous.contentVersion || 1;
  const versions = previous.contentVersions || [];
  let prior = 0;
  for (const entry of versions) {
    if (![1, 2].includes(entry.hashVersion || 1) || !Number.isSafeInteger(entry.version) || entry.version <= prior || entry.version > version || entry.hash !== learningContentHash(entry.content, entry.hashVersion || 1)) throw fail();
    prior = entry.version;
  }
  const current = versions.find(entry => entry.version === version);
  if (current && current.hash !== learningContentHash(previous, current.hashVersion || 1)) throw fail();
  if (current && (current.hashVersion || 1) === 1 && (previous.description || previous.difficulty || previous.featured || previous.needsTags?.length)) throw fail();
  return current;
}
export function appendLearningContentVersions(previous, fields, actor) {
  const version = previous.contentVersion || 1;
  const current = assertLearningContentHistory(previous);
  return [
    ...(!current ? [learningContentSnapshot(previous, { version, actor, provenance: 'RECOVERED_CURRENT_ON_EDIT' })] : []),
    learningContentSnapshot(fields, { version: version + 1, actor }),
  ];
}
