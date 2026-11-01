import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeProposalAsset } from '../../shared/proposalContent.js';
test('removing an image clears its references and preserves the identity of later images', () => {
  const draft = { assets: [{ url: 'first' }, { url: 'removed' }, { url: 'last' }], sections: [{ items: [{ assetIndex: 0 }, { assetIndex: 1 }, { assetIndex: 2 }, { assetIndex: null }] }] };
  const result = removeProposalAsset(draft, 1);
  assert.deepEqual(result.assets.map((a: { url: string }) => a.url), ['first', 'last']);
  assert.deepEqual(result.sections[0].items.map((i: { assetIndex: number | null }) => i.assetIndex), [0, null, 1, null]);
  assert.equal(draft.assets.length, 3, 'Editing a draft does not mutate its prior snapshot');
});
