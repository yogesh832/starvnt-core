import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendLearningContentVersions, learningContentSnapshot, learningContent, learningContentHash, assertLearningContentHistory } from '../src/common/learningContentVersions.js';
import { lessonRecommendationEvidence, lessonRecommendationReasons } from '../src/learning/recommendations.js';

test('legacy Academy hashes remain valid while new metadata is versioned and tamper checked', () => {
  const old = { title: 'Legacy', content: 'Original', contentVersion: 1 };
  const snapshot = { version: 1, content: learningContent(old, 1), hash: learningContentHash(old, 1) };
  assert.equal(assertLearningContentHistory({ ...old, contentVersions: [snapshot] }), snapshot);
  assert.throws(() => assertLearningContentHistory({ ...old, featured: true, contentVersions: [snapshot] }), { code: 'LESSON_CONTENT_HISTORY_CONFLICT' });
  const next = { ...old, description: 'Description', difficulty: 'Recorded level', featured: true, needsTags: ['BANK'] };
  const [newSnapshot] = appendLearningContentVersions({ ...old, contentVersions: [snapshot] }, next, 'fixture');
  assert.equal(newSnapshot.hashVersion, 2);
  assert.equal(newSnapshot.content.featured, true);
  const row = { ...next, contentVersion: 2, contentVersions: [snapshot, newSnapshot] };
  assert.equal(assertLearningContentHistory(row), newSnapshot);
  assert.throws(() => assertLearningContentHistory({ ...row, needsTags: ['PAN'] }), { code: 'LESSON_CONTENT_HISTORY_CONFLICT' });
});

test('Academy suggestions use only explicit known incomplete topics and current-version completion', () => {
  const evidence = lessonRecommendationEvidence({ metrics: [{ key: 'BANK', label: 'Bank Verification', value: 'NOT_SUBMITTED', complete: false }, { key: 'PAN', value: 'UNKNOWN', complete: false }, { key: 'PORTFOLIO', value: 'COMPLETE', complete: true }, { key: 'INVENTED', value: 0, complete: false }], calculationVersion: 'fixture-v1', computedAt: new Date() });
  assert.deepEqual(evidence.needs.map(row => row.key), ['BANK']);
  assert.equal(lessonRecommendationReasons({ needsTags: ['BANK', 'PAN'] }, null, evidence).length, 1);
  assert.deepEqual(lessonRecommendationReasons({ needsTags: ['BANK'] }, { completedAt: new Date() }, evidence), []);
  assert.deepEqual(lessonRecommendationReasons({ needsTags: ['BANK'] }, null, lessonRecommendationEvidence(null)), []);
  assert.equal(lessonRecommendationEvidence(null).status, 'UNAVAILABLE');
});
test('lesson archives preserve legacy current content without inventing missing older versions', () => {
  const old = { title: 'Old', content: 'Old text', resources: 'Old resources', captions: 'Old captions', contentVersion: 4 };
  const next = { ...old, content: 'New text', resources: 'New resources' };
  const versions = appendLearningContentVersions(old, next, 'fixture-editor');
  assert.deepEqual(versions.map(row => row.version), [4, 5]);
  assert.equal(versions[0].provenance, 'RECOVERED_CURRENT_ON_EDIT');
  assert.equal(versions[0].content.resources, 'Old resources');
  assert.equal(versions[1].content.resources, 'New resources');
  assert.equal(old.resources, 'Old resources');
});
test('lesson archives reject altered historical content and unversioned current changes', () => {
  const old = { title: 'Old', content: 'Original', resources: 'Original resource', contentVersion: 1 };
  const archive = learningContentSnapshot(old, { version: 1, actor: 'fixture' });
  assert.throws(() => appendLearningContentVersions({ ...old, resources: 'Changed without version', contentVersions: [archive] }, old, 'fixture'), error => error.code === 'LESSON_CONTENT_HISTORY_CONFLICT');
  archive.content.content = 'Tampered';
  assert.throws(() => appendLearningContentVersions({ ...old, contentVersions: [archive] }, old, 'fixture'), error => error.code === 'LESSON_CONTENT_HISTORY_CONFLICT');
});
