import { createHash } from 'node:crypto';
const contentFields = ['title', 'category', 'objective', 'content', 'resources', 'videoId', 'captions', 'durationSeconds'];
export const learningContent = row => Object.fromEntries(contentFields.map(key => [key, key === 'durationSeconds' ? Number(row[key] || 0) : String(row[key] || '')]));
export const learningContentHash = row => createHash('sha256').update(JSON.stringify(learningContent(row))).digest('hex');
const fail = () => Object.assign(new Error('Lesson content history requires review before editing.'), { code: 'LESSON_CONTENT_HISTORY_CONFLICT', status: 409 });
export function learningContentSnapshot(row, { version, actor, provenance = 'CAPTURED_ON_SAVE', at = new Date() }) {
  return { version, content: learningContent(row), hash: learningContentHash(row), actor: String(actor), capturedAt: at, provenance };
}
export function assertLearningContentHistory(previous) {
  const version = previous.contentVersion || 1;
  const versions = previous.contentVersions || [];
  let prior = 0;
  for (const entry of versions) {
    if (!Number.isSafeInteger(entry.version) || entry.version <= prior || entry.version > version || entry.hash !== learningContentHash(entry.content)) throw fail();
    prior = entry.version;
  }
  const current = versions.find(entry => entry.version === version);
  if (current && current.hash !== learningContentHash(previous)) throw fail();
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
