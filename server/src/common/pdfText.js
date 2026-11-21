/** PDF extraction can insert spaces between glyphs with letter spacing. */
export function hasPdfPageNumber(text, pageNumber, totalPages) {
  if (!Number.isInteger(pageNumber) || !Number.isInteger(totalPages) || pageNumber < 1 || totalPages < pageNumber) return false;
  const compact = String(text).replace(/\s/gu, '');
  return new RegExp(`Page${pageNumber}of${totalPages}(?![0-9])`, 'u').test(compact);
}
