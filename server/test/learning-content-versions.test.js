import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendLearningContentVersions, learningContentSnapshot } from '../src/common/learningContentVersions.js';
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
