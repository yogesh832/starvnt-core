import crypto from 'node:crypto';
import { recordBusinessAudit } from '../../admin/utils/audit.js';

const fail = (code, message, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const limit = 10 * 1024 * 1024;
export function decodePrivateDocument(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > Math.ceil(limit * 4 / 3) + 200) throw fail('INVALID_PRIVATE_DOCUMENT', 'Choose a PDF, JPEG, PNG or WebP up to 10 MB.');
  const match = /^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw fail('PRIVATE_DOCUMENT_CONTENT_REQUIRED', 'Upload the document file directly. External document links require privacy review.');
  const bytes = Buffer.from(match[2], 'base64'), mime = match[1];
  const valid = mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!bytes.length || bytes.length > limit || !valid) throw fail('INVALID_PRIVATE_DOCUMENT', 'The file contents do not match the supported document type or size.');
  return { bytes, mime, size: bytes.length, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
}

export async function sendPrivateDocument(res, document, actorId, actorType) {
  let bytes = document.privateContent && Buffer.from(document.privateContent), mime = document.contentMime;
  if (!bytes?.length) {
    if (!document.fileUrl) throw fail('DOCUMENT_CONTENT_NOT_FOUND', 'No file is attached to this verification record.', 404);
    if (!document.fileUrl.startsWith('data:')) throw fail('LEGACY_DOCUMENT_PRIVACY_REVIEW_REQUIRED', 'This legacy external file requires an authorized privacy migration before it can be opened.', 409);
    const legacy = decodePrivateDocument(document.fileUrl); bytes = legacy.bytes; mime = legacy.mime;
  }
  const documentHash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mime) || (document.contentHash && documentHash !== document.contentHash)) throw fail('DOCUMENT_INTEGRITY_REVIEW_REQUIRED', 'Document integrity requires authorized review.', 409);
  await recordBusinessAudit({ actorId: String(actorId), actorType, organizationId: String(document.vendor), action: 'VENDOR_PRIVATE_DOCUMENT_READ', resourceType: 'VENDOR_DOCUMENT', resourceId: String(document._id), source: 'PRIVATE_DOCUMENT_ACCESS', traceContext: { documentHash } });
  const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff').set('Content-Disposition', `attachment; filename="vendor-document-${document._id}.${extension}"`).type(mime).send(bytes);
}
