import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPdfPageNumber } from '../src/common/pdfText.js';

test('PDF page numbering tolerates extracted glyph spacing without accepting wrong page numbers or totals', () => {
  for (const text of ['Page 1 of 3', 'Pa g e   1   o f   3', 'P a g e\u00a01\u2009o f\n3', 'Header Page1of3 Footer']) {
    assert.equal(hasPdfPageNumber(text, 1, 3), true, text);
  }
  for (const text of ['Page 2 of 3', 'Page 1 of 4', 'Page 10 of 3', 'Page 1 of 30', 'No footer']) {
    assert.equal(hasPdfPageNumber(text, 1, 3), false, text);
  }
  assert.equal(hasPdfPageNumber('Page 0 of 3', 0, 3), false);
  assert.equal(hasPdfPageNumber('Page 4 of 3', 4, 3), false);
});
