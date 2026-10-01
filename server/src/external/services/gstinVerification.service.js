import { config } from '../../config.js';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;

function compact(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(private|pvt|limited|ltd|llp|inc|company|co|the|and)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return normalizeName(value).split(' ').filter((part) => part.length >= 3);
}

function pick(obj, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function dataRoot(json) {
  return json?.data || json?.result || json?.gstin || json?.taxpayer || json || {};
}

function addressOf(data) {
  const addr = data?.pradr?.addr || data?.principalPlaceOfBusiness?.address || data?.address || {};
  if (typeof addr === 'string') return addr;
  return [
    addr.bno,
    addr.flno,
    addr.bnm,
    addr.st,
    addr.loc,
    addr.dst,
    addr.stcd,
    addr.pncd,
  ].filter(Boolean).join(', ');
}

export function compareBusinessNames(vendorName, gstLegalName, gstTradeName = '') {
  const vendor = normalizeName(vendorName);
  const legal = normalizeName(gstLegalName);
  const trade = normalizeName(gstTradeName);
  if (!vendor || (!legal && !trade)) return { matched: false, confidence: 'NONE' };
  if (vendor === legal || vendor === trade) return { matched: true, confidence: 'EXACT' };
  if ((legal && (legal.includes(vendor) || vendor.includes(legal))) || (trade && (trade.includes(vendor) || vendor.includes(trade)))) {
    return { matched: true, confidence: 'HIGH' };
  }
  const vendorTokens = new Set(tokens(vendor));
  const candidateTokens = new Set([...tokens(legal), ...tokens(trade)]);
  const overlap = [...vendorTokens].filter((part) => candidateTokens.has(part)).length;
  const ratio = vendorTokens.size ? overlap / vendorTokens.size : 0;
  if (ratio >= 0.75 && overlap >= 2) return { matched: true, confidence: 'MEDIUM' };
  return { matched: false, confidence: ratio >= 0.4 ? 'LOW' : 'NONE' };
}

export async function verifyGstin(gstin, vendorName) {
  const normalizedGstin = compact(gstin).toUpperCase();
  if (!GSTIN_RE.test(normalizedGstin)) {
    return { ok: false, error: 'INVALID_GSTIN_FORMAT', checkedAt: new Date() };
  }
  if (!config.gstinApiKey) {
    return { ok: false, error: 'GSTIN_API_NOT_CONFIGURED', checkedAt: new Date() };
  }

  const url = `${config.gstinApiBaseUrl.replace(/\/$/, '')}/gstin/${encodeURIComponent(normalizedGstin)}`;
  const checkedAt = new Date();
  try {
    const response = await fetch(url, { headers: { 'x-api-key': config.gstinApiKey } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: json?.message || json?.error || `GSTIN_API_${response.status}`, raw: json, checkedAt };
    }

    const data = dataRoot(json);
    const legalName = pick(data, ['lgnm', 'legalName', 'legal_name', 'tradeLegalName', 'name']);
    const tradeName = pick(data, ['tradeNam', 'tradeName', 'trade_name', 'businessName']);
    const gstinStatus = pick(data, ['sts', 'status', 'gstinStatus']);
    const taxpayerType = pick(data, ['dty', 'taxpayerType', 'taxPayerType']);
    const registrationDate = pick(data, ['rgdt', 'registrationDate', 'dateOfRegistration']);
    const match = compareBusinessNames(vendorName, legalName, tradeName);

    return {
      ok: true,
      gstin: normalizedGstin,
      legalName,
      tradeName,
      gstinStatus,
      taxpayerType,
      registrationDate,
      address: addressOf(data),
      raw: json,
      checkedAt,
      ...match,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'GSTIN_API_FAILED', checkedAt };
  }
}
