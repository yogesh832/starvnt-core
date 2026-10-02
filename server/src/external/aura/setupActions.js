import { VendorService } from '../models/VendorService.js';
import { VendorCapability } from '../models/VendorCapability.js';
import { OperatingLocation } from '../models/OperatingLocation.js';
import { ServiceCoverage } from '../models/ServiceCoverage.js';
import { VendorBlockout } from '../models/VendorBlockout.js';
import { Quote } from '../models/Quote.js';
import { Opportunity } from '../models/Opportunity.js';
import { VendorMessageThread } from '../models/VendorMessageThread.js';
import { createQuote } from '../services/quoteStateMachine.service.js';
import { notifyCustomer } from '../../notifications/notification.service.js';
import { evaluateVendorActivation } from '../services/vendorActivation.service.js';

/**
 * Operational & profile-setup actions Vendor Aura+ can carry out from chat/voice:
 * add a service, team & gear, operating location, coverage area,
 * calendar date blockout, create quote, and revise quote.
 *
 * Flow: the model proposes an action → validate() → the vendor sees a summary
 * and confirms ("yes" / ✓ button) → execute(). Nothing is saved without that
 * confirmation. Defaults mirror the POST routes in vendor.routes.js and transaction.routes.js.
 */

const PRICING_TYPES = ['FIXED', 'HOURLY', 'PER_PERSON', 'TIERED', 'CUSTOM'];
const UNITS = { FIXED: 'event', HOURLY: 'hour', PER_PERSON: 'guest', TIERED: 'event', CUSTOM: 'event' };
const LOCATION_TYPES = ['STUDIO', 'HEAD_OFFICE', 'BRANCH', 'WAREHOUSE', 'KITCHEN', 'EQUIPMENT_HUB', 'STORAGE'];

const MONTH_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const HINDI_DAY_WORDS = {
  ek: 1, pehli: 1,
  do: 2, dusri: 2,
  teen: 3, teesri: 3,
  char: 4, chaar: 4, chauth: 4, chauthi: 4,
  paanch: 5, panch: 5, panchvi: 5,
  che: 6, chhe: 6, chhati: 6,
  saat: 7, satvi: 7,
  aath: 8, athvi: 8,
  nau: 9, navi: 9,
  das: 10, dus: 10, dasvi: 10,
  gyarah: 11, gyarvi: 11,
  barah: 12, barvi: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  ikkees: 21, ikkis: 21,
  baees: 22, bais: 22,
  teis: 23, teees: 23,
  chaubees: 24, chaubis: 24,
  pachchees: 25, pachis: 25,
  chhabees: 26, chhabis: 26,
  sattaees: 27, satais: 27,
  atthaees: 28, athais: 28,
  untees: 29, untis: 29,
  tees: 30,
  ikattees: 31, iktis: 31,
};

const str = (v, max) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};
const list = (v, max = 12) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((x) => str(String(x), 60))
    .filter(Boolean)
    .slice(0, max);
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Parse human dates (ISO, DD-MM-YYYY, DD/MM/YYYY, "5 October", "paanch tarikh", "09-10-2026") into YYYY-MM-DD. */
export function parseDate(val, fallbackToday = new Date()) {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim();

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const baseDate = fallbackToday instanceof Date ? fallbackToday : new Date(fallbackToday);
  const defaultYear = Number.isFinite(baseDate?.getFullYear?.()) ? baseDate.getFullYear() : 2026;
  const defaultMonth = Number.isFinite(baseDate?.getMonth?.()) ? baseDate.getMonth() + 1 : 10;

  // e.g. "5 October 2026", "5th Oct", "October 5", "09 Oct 2026"
  const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const dmRe = new RegExp(`(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})|(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:\\s+(\\d{4}))?`, 'i');
  const mm = dmRe.exec(s);
  if (mm) {
    const d = Number(mm[1] || mm[4]);
    const mName = String(mm[2] || mm[3]).slice(0, 3).toLowerCase();
    const m = MONTH_MAP[mName];
    const y = Number(mm[5]) || defaultYear;
    if (m && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // e.g. "paanch October" or "paanch tarikh"
  const hindiWordRe = new RegExp(`\\b(${Object.keys(HINDI_DAY_WORDS).join('|')})\\s*(?:tarikh|taarikh|date|(${monthNames}))?`, 'i');
  const hm = hindiWordRe.exec(s);
  if (hm) {
    const d = HINDI_DAY_WORDS[hm[1].toLowerCase()];
    const mName = hm[2] ? String(hm[2]).slice(0, 3).toLowerCase() : null;
    const m = (mName && MONTH_MAP[mName]) || defaultMonth;
    if (d && m) {
      return `${defaultYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // e.g. "5 tarikh"
  const digitTarikh = /(\d{1,2})\s*(?:tarikh|taarikh)\b/i.exec(s);
  if (digitTarikh) {
    const d = Number(digitTarikh[1]);
    if (d >= 1 && d <= 31) {
      return `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

/** Extract a date mentioned inside text. */
export function dateIn(text, fallbackToday = new Date()) {
  const s = String(text || '');
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(s);
  if (iso) {
    const parsed = parseDate(iso[1], fallbackToday);
    if (parsed) return parsed;
  }
  const dmy = /\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/.exec(s);
  if (dmy) {
    const parsed = parseDate(dmy[1], fallbackToday);
    if (parsed) return parsed;
  }
  const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const dmRe = new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})|(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:\\s+(\\d{4}))?\\b`, 'i');
  const dm = dmRe.exec(s);
  if (dm) {
    const parsed = parseDate(dm[0], fallbackToday);
    if (parsed) return parsed;
  }
  const hindiRe = new RegExp(`\\b(?:(${Object.keys(HINDI_DAY_WORDS).join('|')})|(\\d{1,2}))\\s*(?:tarikh|taarikh|date)\\b`, 'i');
  const hm = hindiRe.exec(s);
  if (hm) {
    const parsed = parseDate(hm[0], fallbackToday);
    if (parsed) return parsed;
  }
  return null;
}

function cleanReason(raw) {
  if (!raw) return null;
  let str = String(raw).replace(/[.!?]+$/g, '').trim();
  let prev;
  do {
    prev = str;
    str = str
      .replace(/^[:=\-\s]+|[:=\-\s]+$/g, '')
      .replace(/^(?:edit|change|badlo|badal\s*kar|badal\s*ke|karo|update|set|rakho|rakhna|is|hai|to|me|mein|ko|karke|ke\s*liye|liye|likho|rakh\s*do|kardo|kar\s*do)\s+/gi, '')
      .replace(/\s+(?:hai|hoga|hogi|rakho|rakhna|kardo|kar\s*do|kar\s*dena|karna|karo|rakh\s*do|please|pls)\s*$/gi, '')
      .replace(/^[:=\-\s]+|[:=\-\s]+$/g, '')
      .trim();
  } while (str !== prev);

  if (str.length < 2 || str.length > 80 || /^(?:e\.g\.|example|reason|notes)$/i.test(str)) return null;
  if (/^birthday(\s*party)?$/i.test(str)) return 'Birthday Party';
  if (/^manual(\s*booking)?$/i.test(str)) return 'Manual Booking';
  if (/^wedding(\s*event)?$/i.test(str)) return 'Wedding';
  if (/^vacation$/i.test(str)) return 'Vacation';
  if (/^maintenance$/i.test(str)) return 'Maintenance';
  if (/^personal$/i.test(str)) return 'Personal';

  if (/^[a-z0-9\s'-]+$/.test(str)) {
    str = str.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return str;
}

/** Extract reason / notes for blocking date from vendor messages. */
export function reasonFrom(text) {
  const s = String(text || '');
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const reversed = lines.length ? [...lines].reverse() : [s];

  for (const line of reversed) {
    const rm = /(?:reason|notes?|wajah|karan)\s*[:=\-]\s*([^\n,.]+)/i.exec(line);
    if (rm) {
      const val = cleanReason(rm[1]);
      if (val) return val;
    }

    const re = /\b(?:reason|notes?|wajah|karan)\b/gi;
    let match;
    let lastIdx = -1;
    while ((match = re.exec(line)) !== null) {
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx !== -1) {
      const after = line.slice(lastIdx);
      const cleaned = cleanReason(after);
      if (cleaned && cleaned.length >= 2) return cleaned;
    }

    if (/\bbirthday(?:\s*party|\s*celebration)?\b/i.test(line)) return 'Birthday Party';
    if (/\bwedding|shaadi|marriage|sangeet|reception|haldi|mehendi\b/i.test(line)) return 'Wedding';
    if (/\bmanual(?:ly)?\b.*?\bbook(?:ing|ed)?\b|\bbook(?:ing|ed)?\b.*?\bmanual(?:ly)?\b|\boffline\b.*?\bbook(?:ing|ed)?\b/i.test(line)) {
      return 'Manual Booking';
    }
    if (/\bvacation|holiday|chhutti|trip|tour\b/i.test(line)) return 'Vacation';
    if (/\bmaintenance|repair|renovation|servicing\b/i.test(line)) return 'Maintenance';
    if (/\bpersonal|family|ghar\s*ka\s*kaam\b/i.test(line)) return 'Personal';
    if (/\bcommercial\s*shoot|pre-wedding\s*shoot|\bshoot\b/i.test(line)) return 'Shoot';

    const isQuery = /\b(kya|kaise|kitna|kitne|kitni|kab|kahan|kaha|kyun|kyu|who|what|when|where|why|how|which|show|list|tell|dikhao|batao|bataiye|dekhna|dekho|rating|ratings|review|reviews|enquir|quote|booking|payment)\b|\?/i.test(line);
    if (!isQuery && line.split(/\s+/).length <= 5 && !/[?0-9]/.test(line) && !/^(confirm|cancel|yes|no|haan|nahi|availability|calendar|open|view|block|update)/i.test(line)) {
      const cleaned = cleanReason(line);
      if (cleaned && cleaned.length >= 3) return cleaned;
    }
  }

  return null;
}


/** Every amount written in the text: 25000, 25,000, 25k, 25 hazar, 1.5 lakh. */
export function amountsIn(text) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)*)\s*(k|thousand|hazaar|hazar|hajar|lakh|lac|lakhs)?\b/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = m[1].includes('.') && !m[1].includes(',') ? m[1] : m[1].replace(/,/g, '');
    let n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const unit = (m[2] || '').toLowerCase();
    if (['k', 'thousand', 'hazaar', 'hazar', 'hajar'].includes(unit)) n *= 1000;
    if (['lakh', 'lac', 'lakhs'].includes(unit)) n *= 100000;
    out.push(Math.round(n));
  }
  return out;
}

/** Last number in the text followed by one of `words` ("4 log", "30 km"). */
function numberBefore(text, words) {
  const re = new RegExp(`(\\d+)\\s*(?:${words})`, 'gi');
  let m;
  let last = null;
  while ((m = re.exec(String(text || '')))) last = Number(m[1]);
  return last;
}

const FILLER = /\b(we|i|hum|main|use|uses|using|karte|karti|karta|hain|hai|he|ho|have|has|got|bhi|hamare|humare|mere|my|our|paas|pass|equipment|gear|with|aur bhi|etc)\b/gi;

/**
 * Equipment the vendor listed in their latest message when the model leaves it out:
 * "team me 3 photographers hain, Canon R6 aur gimbal" → ["Canon R6", "gimbal"].
 */
export function equipmentFrom(text) {
  const latest = String(text || '').split('\n').pop();
  return latest
    .split(/[,;]|[.!?](?:\s+|$)|\s+(?:aur|and|or|evam|tatha)\s+|\s*&\s*/i)
    .filter((part) => !/\d+\s*(?:log|logon|people|persons?|members?|jan|crew|team|photographers?|staff)/i.test(part) && !/\bteam\b/i.test(part))
    .map((part) => part.replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 2 && part.length <= 40)
    .slice(0, 8);
}

/** Most recent amount that looks like a price (≥ ₹100). */
function statedPrice(text) {
  const prices = amountsIn(text).filter((n) => n >= 100);
  return prices.length ? prices[prices.length - 1] : null;
}

/** "outstation bhi karte hain" / "we travel outstation" in the latest message, not negated. */
export function saysOutstation(text) {
  const latest = String(text || '').split('\n').pop();
  if (!/(outstation|out of city|out-station|bahar bhi|dusre shehar|other cities|destination)/i.test(latest)) return false;
  return !/(no outstation|not outstation|outstation nahi|outstation nahin|nahi jaate|don'?t travel|do not travel)/i.test(latest);
}

function normalizePricingType(v) {
  const t = String(v || '').toUpperCase();
  if (t.includes('HOUR')) return 'HOURLY';
  if (t.includes('PERSON') || t.includes('PLATE') || t.includes('GUEST') || t.includes('HEAD')) return 'PER_PERSON';
  if (t.includes('TIER')) return 'TIERED';
  if (t.includes('CUSTOM')) return 'CUSTOM';
  return 'FIXED';
}

function findQuote(quotesList = [], { quoteId, quoteRef, customerName }) {
  if (quoteId) {
    const byId = quotesList.find((q) => String(q.id || q._id) === String(quoteId));
    if (byId) return byId;
  }
  if (quoteRef) {
    const refClean = String(quoteRef).trim().toLowerCase();
    const byRef = quotesList.find((q) => String(q.ref || q.quoteReference || '').toLowerCase() === refClean);
    if (byRef) return byRef;
  }
  if (customerName) {
    const custClean = String(customerName).trim().toLowerCase();
    const byCust = quotesList.find((q) => String(q.customer || q.customerName || '').toLowerCase().includes(custClean));
    if (byCust) return byCust;
  }
  return quotesList[0] || null;
}

function findEnquiry(enquiriesList = [], { opportunityId, customerName }) {
  if (opportunityId) {
    const byId = enquiriesList.find((e) => String(e.id || e._id) === String(opportunityId));
    if (byId) return byId;
  }
  if (customerName) {
    const custClean = String(customerName).trim().toLowerCase();
    const byCust = enquiriesList.find((e) => String(e.customer || e.customerName || '').toLowerCase().includes(custClean));
    if (byCust) return byCust;
  }
  return enquiriesList[0] || null;
}

function pickService(services, name) {
  const active = (services || []).filter((s) => s.status !== 'ARCHIVED');
  if (!active.length) return null;
  const n = String(name || '').toLowerCase().trim();
  return (n && active.find((s) => s.name.toLowerCase().includes(n))) || active[0];
}

/**
 * Turn the model's proposal into a clean action, or { error } explaining what is missing.
 * `said` = the vendor's recent messages (oldest → newest).
 */
export function validateAction(raw, { said, vendor = {}, services = [], context = {} } = {}) {
  const kind = raw?.kind;
  const stated = new Set(amountsIn(said));

  if (kind === 'service') {
    const s = raw.service || {};
    const name = str(s.name, 120);
    const basePrice = Number(s.basePrice) > 0 ? Number(s.basePrice) : statedPrice(said);
    if (!name) return { error: 'the service name' };
    if (!(basePrice > 0) || !stated.has(Math.round(basePrice))) return { error: 'the base price' };
    const pricingType = PRICING_TYPES.includes(String(s.pricingType).toUpperCase()) ? String(s.pricingType).toUpperCase() : normalizePricingType(s.pricingType || String(said).split('\n').pop());
    const category = str(s.category, 60) || vendor.category || 'Photography';
    return {
      action: { kind, service: { name, category, pricingType, basePrice: Math.round(basePrice), unit: UNITS[pricingType] } },
    };
  }

  if (kind === 'capability') {
    const c = raw.capability || {};
    const teamSize = Number(c.teamSize) || numberBefore(said, 'log|logon|people|persons?|members?|jan|crew|team|photographers?|staff');
    if (!(teamSize >= 1 && teamSize <= 500) || !stated.has(teamSize)) return { error: 'your team size' };
    const service = pickService(services, c.serviceName);
    if (!service) return { error: 'a service first (add one before team & gear)' };
    return {
      action: {
        kind,
        capability: {
          serviceId: String(service._id),
          serviceName: service.name,
          teamSize,
          equipment: list(c.equipment).length ? list(c.equipment) : equipmentFrom(said),
          styles: list(c.styles),
          format: str(c.format, 40) || 'Full day',
        },
      },
    };
  }

  if (kind === 'location') {
    const l = raw.location || {};
    const city = str(l.city, 80) || str(vendor.location?.split(',').pop(), 80) || 'Mumbai';
    const locality = str(l.locality, 80) || '';
    const address = str(l.address, 200) || locality || city || 'Interactive Map Base';
    const type = LOCATION_TYPES.includes(String(l.type).toUpperCase()) ? String(l.type).toUpperCase() : 'STUDIO';
    return {
      action: {
        kind,
        location: {
          label: str(l.label, 80) || `${vendor.businessName || 'Main'} ${type === 'STUDIO' ? 'Studio' : 'Office'}`,
          type,
          address,
          locality,
          city,
          state: str(l.state, 60) || '',
          postalCode: str(l.postalCode, 12) || '',
        },
      },
    };
  }

  if (kind === 'coverage') {
    const c = raw.coverage || {};
    const radiusKm = Number(c.radiusKm) || numberBefore(said, 'km|kms|kilometers?|kilometres?') || 40;
    const service = pickService(services, c.serviceName);
    const city = str(c.city, 80) || str(vendor.location?.split(',').pop(), 80) || 'Mumbai';
    return {
      action: {
        kind,
        coverage: {
          serviceId: service ? String(service._id) : null,
          serviceName: service ? service.name : 'Primary Service',
          radiusKm: Math.round(radiusKm),
          city,
          localities: list(c.localities),
          outstationAllowed: c.outstationAllowed === true || saysOutstation(said),
        },
      },
    };
  }

  if (kind === 'block_date') {
    const b = raw.blockout || {};
    const lines = String(said || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const latestUserMsg = lines[lines.length - 1] || '';
    const latestReason = reasonFrom(latestUserMsg);

    let date = parseDate(b.date) || dateIn(latestUserMsg) || dateIn(said);
    if (!date && context?.blockedDates?.length) {
      date = context.blockedDates[context.blockedDates.length - 1]?.date;
    }
    if (!date) return { error: 'the date to block' };

    const reason = latestReason || str(b.reason, 150) || reasonFrom(said);
    if (!reason || reason.toLowerCase() === 'unavailable') {
      return { error: 'the reason / notes for blocking the date (e.g. Vacation, Maintenance, Personal, Manual Booking)' };
    }

    const isUpdate = Boolean(context?.blockedDates?.some((bl) => bl.date === date));
    const startTime = str(b.startTime, 10) || '00:00';
    const endTime = str(b.endTime, 10) || '23:59';
    const allDay = b.allDay !== false;
    return {
      action: {
        kind,
        isUpdate,
        blockout: { date, reason, startTime, endTime, allDay },
      },
    };
  }

  if (kind === 'revise_quote') {
    const q = raw.quote || {};
    const quotesList = context?.quotes?.latest || [];
    const matched = findQuote(quotesList, q);
    const quoteRef = str(q.quoteRef, 60) || matched?.ref || null;
    const quoteId = str(q.quoteId, 60) || matched?.id || null;
    const customerName = str(q.customerName, 80) || matched?.customer || null;

    if (!quoteRef && !quoteId && !customerName) {
      return { error: 'which quote to revise (quote reference or customer name)' };
    }

    const statedPrices = amountsIn(said);
    let basePrice = Number(q.basePrice) > 0 ? Number(q.basePrice) : null;
    let travelFee = Number(q.travelFee) >= 0 ? Number(q.travelFee) : 0;
    let totalAmount = Number(q.totalAmount) > 0 ? Number(q.totalAmount) : null;

    if (!basePrice && !totalAmount && statedPrices.length) {
      if (statedPrices.length >= 2) {
        basePrice = statedPrices[statedPrices.length - 2];
        travelFee = statedPrices[statedPrices.length - 1];
        totalAmount = basePrice + travelFee;
      } else {
        basePrice = statedPrices[statedPrices.length - 1];
        totalAmount = basePrice + travelFee;
      }
    } else if (basePrice && !totalAmount) {
      totalAmount = basePrice + travelFee;
    } else if (!basePrice && totalAmount) {
      basePrice = totalAmount - travelFee;
    }

    if (!(totalAmount > 0)) {
      return { error: `the revised amount for quote ${quoteRef || customerName || ''}` };
    }

    const notes = str(q.notes, 500) || '';

    return {
      action: {
        kind,
        quote: {
          quoteId,
          quoteRef: quoteRef || matched?.ref || 'QT-REVISION',
          customerName: customerName || 'Customer',
          serviceName: str(q.serviceName, 120) || matched?.service || 'Event Service',
          basePrice: Math.round(basePrice),
          travelFee: Math.round(travelFee),
          totalAmount: Math.round(totalAmount),
          notes,
        },
      },
    };
  }

  if (kind === 'create_quote') {
    const q = raw.quote || {};
    const enquiriesList = context?.enquiries?.open || [];
    const matched = findEnquiry(enquiriesList, q);

    const opportunityId = str(q.opportunityId, 60) || matched?.id || null;
    const customerId = str(q.customerId, 60) || matched?.customerId || null;
    const customerName = str(q.customerName, 80) || matched?.customer || null;
    if (!customerName && !customerId && !opportunityId) {
      return { error: 'the customer name or enquiry for the quotation' };
    }

    const activeService = pickService(services, q.serviceName || matched?.service);
    const serviceName = str(q.serviceName, 120) || matched?.service || activeService?.name;
    if (!serviceName) {
      return { error: 'the service for this quote' };
    }

    const eventDate = parseDate(q.eventDate) || parseDate(matched?.eventDate) || dateIn(said);
    if (!eventDate) {
      return { error: `the event date for ${customerName || 'customer'}` };
    }

    const statedPrices = amountsIn(said);
    let basePrice = Number(q.basePrice) > 0 ? Number(q.basePrice) : null;
    let travelFee = Number(q.travelFee) >= 0 ? Number(q.travelFee) : 0;
    let totalAmount = Number(q.totalAmount) > 0 ? Number(q.totalAmount) : null;

    if (!basePrice && !totalAmount && statedPrices.length) {
      if (statedPrices.length >= 2) {
        basePrice = statedPrices[statedPrices.length - 2];
        travelFee = statedPrices[statedPrices.length - 1];
        totalAmount = basePrice + travelFee;
      } else {
        basePrice = statedPrices[statedPrices.length - 1];
        totalAmount = basePrice + travelFee;
      }
    } else if (basePrice && !totalAmount) {
      totalAmount = basePrice + travelFee;
    } else if (!basePrice && totalAmount) {
      basePrice = totalAmount - travelFee;
    }

    if (!(totalAmount > 0)) {
      return { error: `the quote amount for ${customerName || 'customer'}` };
    }

    const notes = str(q.notes, 500) || '';

    return {
      action: {
        kind,
        quote: {
          opportunityId,
          customerId,
          customerName: customerName || 'Customer',
          vendorServiceId: activeService ? String(activeService._id) : null,
          serviceName,
          eventDate,
          basePrice: Math.round(basePrice),
          travelFee: Math.round(travelFee),
          totalAmount: Math.round(totalAmount),
          notes,
        },
      },
    };
  }

  return { error: null };
}

/** One-line summary the vendor confirms. */
export function describeAction(a) {
  if (a.kind === 'service') {
    const s = a.service;
    return `Add service “${s.name}” (${s.category}) — ${inr(s.basePrice)}${s.pricingType === 'FIXED' ? ' per event' : ` per ${s.unit}`}`;
  }
  if (a.kind === 'capability') {
    const c = a.capability;
    return `Team & gear for “${c.serviceName}” — team of ${c.teamSize}${c.equipment.length ? `, equipment: ${c.equipment.join(', ')}` : ''}${c.styles.length ? `, styles: ${c.styles.join(', ')}` : ''}`;
  }
  if (a.kind === 'location') {
    const l = a.location;
    return `Add ${l.type.toLowerCase().replace('_', ' ')} location “${l.label}” — ${[l.address, l.locality !== l.address ? l.locality : '', l.city].filter(Boolean).join(', ')}`;
  }
  if (a.kind === 'coverage') {
    const c = a.coverage;
    return `Coverage for “${c.serviceName}” — up to ${c.radiusKm} km${c.city ? ` around ${c.city}` : ''}${c.outstationAllowed ? ', outstation allowed' : ''}`;
  }
  if (a.kind === 'block_date') {
    const b = a.blockout;
    const prefix = a.isUpdate ? 'Update calendar date' : 'Block calendar date';
    return `${prefix} ${b.date}${b.reason ? ` — Reason: ${b.reason}` : ''}${b.allDay === false ? ` (${b.startTime} - ${b.endTime})` : ''}`;
  }
  if (a.kind === 'revise_quote') {
    const q = a.quote;
    const parts = [`Total ${inr(q.totalAmount)}`];
    if (q.travelFee > 0) parts.push(`Base: ${inr(q.basePrice)}`, `Travel: ${inr(q.travelFee)}`);
    return `Revise quote ${q.quoteRef || ''} for ${q.customerName || 'customer'} — ${parts.join(', ')}${q.notes ? ` (Notes: ${q.notes})` : ''}`;
  }
  if (a.kind === 'create_quote') {
    const q = a.quote;
    const parts = [`Total ${inr(q.totalAmount)}`];
    if (q.travelFee > 0) parts.push(`Base: ${inr(q.basePrice)}`, `Travel: ${inr(q.travelFee)}`);
    return `Create quote for ${q.customerName || 'customer'} (${q.serviceName} on ${q.eventDate}) — ${parts.join(', ')}`;
  }
  return 'Unknown action';
}

/** Carry out a confirmed action for this vendor. */
export async function executeAction(vendor, a) {
  const vendorId = vendor._id;

  if (a.kind === 'service') {
    const s = a.service;
    await VendorService.create({
      vendor: vendorId,
      name: s.name,
      category: s.category,
      pricing: { pricingType: s.pricingType, basePrice: s.basePrice, unit: s.unit, taxIncluded: true, conditionalCharges: [] },
      leadTimeDays: 7,
      cancellationPolicy: 'Standard 48-hour',
      deliverables: [],
      status: 'ACTIVE',
    });
    return evaluateVendorActivation(vendorId);
  }

  if (a.kind === 'capability') {
    const c = a.capability;
    const service = await VendorService.findOne({ _id: c.serviceId, vendor: vendorId });
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    const existing = await VendorCapability.findOne({ vendor: vendorId, vendorService: service._id });
    if (existing) {
      existing.teamSize = c.teamSize;
      if (c.equipment.length) existing.equipment = c.equipment;
      if (c.styles.length) existing.styles = c.styles;
      existing.format = c.format;
      await existing.save();
    } else {
      await VendorCapability.create({ vendor: vendorId, vendorService: service._id, styles: c.styles, format: c.format, teamSize: c.teamSize, simultaneousEventLimit: 1, equipment: c.equipment, categoryAttributes: {} });
    }
    return evaluateVendorActivation(vendorId);
  }

  if (a.kind === 'location') {
    const l = a.location;
    const isPrimary = (await OperatingLocation.countDocuments({ vendor: vendorId })) === 0;
    const loc = await OperatingLocation.create({ vendor: vendorId, ...l, state: l.state || 'West Bengal', coordinates: { lat: 0, lng: 0 }, isPrimary });
    if (isPrimary || !vendor.location) {
      vendor.location = `${loc.locality ? `${loc.locality}, ` : ''}${loc.city}`;
      if (vendor.businessName && vendor.category) vendor.isProfileCompleted = true;
      await vendor.save();
    }

    // Auto-sync default ServiceCoverage if vendor has active services without coverage
    const existingCoverageCount = await ServiceCoverage.countDocuments({ vendor: vendorId });
    if (existingCoverageCount === 0) {
      const activeServices = await VendorService.find({ vendor: vendorId, status: 'ACTIVE' });
      for (const svc of activeServices) {
        await ServiceCoverage.create({
          vendor: vendorId,
          vendorService: svc._id,
          coverageType: 'RADIUS',
          city: loc.city,
          state: loc.state || '',
          baseAddress: loc.address || '',
          baseLocality: loc.locality || '',
          basePostalCode: loc.postalCode || '',
          baseCoordinates: loc.coordinates || { lat: 0, lng: 0 },
          radiusKm: 40,
          confidence: 'SELF_DECLARED',
          outstationAllowed: false,
        });
      }
    }

    return evaluateVendorActivation(vendorId);
  }

  if (a.kind === 'coverage') {
    const c = a.coverage;
    const service = await VendorService.findOne({ _id: c.serviceId, vendor: vendorId });
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    const existing = await ServiceCoverage.findOne({ vendor: vendorId, vendorService: service._id });
    if (existing) {
      existing.coverageType = 'RADIUS';
      existing.radiusKm = c.radiusKm;
      if (c.city) existing.city = c.city;
      if (c.localities.length) existing.localities = c.localities;
      existing.outstationAllowed = c.outstationAllowed;
      await existing.save();
    } else {
      await ServiceCoverage.create({ vendor: vendorId, vendorService: service._id, coverageType: 'RADIUS', localities: c.localities, city: c.city, state: '', radiusKm: c.radiusKm, confidence: 'SELF_DECLARED', outstationAllowed: c.outstationAllowed });
    }

    // Auto-sync OperatingLocation if vendor has no location record defined yet
    const existingLocCount = await OperatingLocation.countDocuments({ vendor: vendorId });
    if (existingLocCount === 0) {
      const targetCity = c.city || vendor.location?.split(',').pop()?.trim() || 'Main City';
      const targetLocality = c.localities?.[0] || '';
      const loc = await OperatingLocation.create({
        vendor: vendorId,
        label: `${vendor.businessName || 'Main'} Studio / Office`,
        type: 'HEAD_OFFICE',
        address: [targetLocality, targetCity].filter(Boolean).join(', ') || targetCity,
        locality: targetLocality,
        city: targetCity,
        state: 'West Bengal',
        postalCode: '',
        coordinates: { lat: 0, lng: 0 },
        isPrimary: true,
      });

      if (!vendor.location) {
        vendor.location = `${loc.locality ? `${loc.locality}, ` : ''}${loc.city}`;
        if (vendor.businessName && vendor.category) vendor.isProfileCompleted = true;
        await vendor.save();
      }
    }

    return evaluateVendorActivation(vendorId);
  }

  if (a.kind === 'block_date') {
    const b = a.blockout;
    const existing = await VendorBlockout.findOne({ vendor: vendorId, date: b.date });
    const isUpdate = Boolean(existing);
    if (existing) {
      existing.reason = b.reason || existing.reason;
      existing.startTime = b.startTime || '00:00';
      existing.endTime = b.endTime || '23:59';
      existing.allDay = b.allDay !== false;
      await existing.save();
    } else {
      await VendorBlockout.create({
        vendor: vendorId,
        date: b.date,
        startTime: b.startTime || '00:00',
        endTime: b.endTime || '23:59',
        allDay: b.allDay !== false,
        reason: b.reason || 'Unavailable',
      });
    }
    return { kind: 'block_date', date: b.date, reason: b.reason, isUpdate };
  }

  if (a.kind === 'revise_quote') {
    const q = a.quote;
    let quote = null;
    if (q.quoteId) {
      quote = await Quote.findOne({ _id: q.quoteId, vendor: vendorId });
    }
    if (!quote && q.quoteRef) {
      quote = await Quote.findOne({ quoteReference: q.quoteRef, vendor: vendorId });
    }
    if (!quote && q.customerName) {
      const quotes = await Quote.find({ vendor: vendorId, status: { $in: ['DRAFT', 'SUBMITTED'] } }).populate('customer');
      quote = quotes.find((x) => x.customer?.fullName?.toLowerCase().includes(q.customerName.toLowerCase()));
    }
    if (!quote) throw new Error('QUOTE_NOT_FOUND');
    if (!['DRAFT', 'SUBMITTED'].includes(quote.status)) {
      throw new Error('QUOTE_NOT_EDITABLE');
    }

    const basePrice = Math.round(Number(q.basePrice) || 0);
    const travelFee = Math.round(Number(q.travelFee) || 0);
    const totalAmount = Math.round(Number(q.totalAmount) || (basePrice + travelFee));

    const pricing = {
      basePrice,
      travelFee,
      equipmentFee: 0,
      setupFee: 0,
      additionalFee: 0,
      totalAmount,
    };

    const rawNotes = String(q.notes || '').trim();
    const reasonText = rawNotes ? `Vendor revised offer: ${rawNotes}` : `Vendor revised offer to ₹${totalAmount.toLocaleString('en-IN')}`;

    const previousStatus = quote.status;
    quote.pricingBreakdown = pricing;
    if (rawNotes) quote.notes = rawNotes;
    quote.status = 'SUBMITTED';
    quote.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    quote.advancePayment = {
      percentage: 30,
      amount: 0,
      status: 'NOT_STARTED',
      provider: 'razorpay',
      providerOrderId: '',
      providerPaymentId: '',
      paidAt: null,
    };
    quote.history.push({
      fromStatus: previousStatus,
      toStatus: 'SUBMITTED',
      changedBy: vendor.businessName || 'Vendor',
      reason: reasonText,
      timestamp: new Date(),
    });
    await quote.save();

    try {
      await notifyCustomer({
        customerId: quote.customer,
        title: 'Vendor Revised Offer',
        body: `${vendor.businessName || 'Vendor'} sent a revised quotation for ${quote.serviceName}: ₹${pricing.totalAmount.toLocaleString('en-IN')}.`,
        type: 'quote',
        priority: 'HIGH',
        actionUrl: '/customer/events',
        idempotencyKey: `customer.quote.revised.${quote._id}.${quote.history.length}`,
        payload: { quoteId: quote._id },
      });
    } catch (err) {
      console.warn('[vendor-aura] notifyCustomer on revise_quote skipped:', err?.message || err);
    }

    try {
      const thread = await VendorMessageThread.findOne({ vendor: quote.vendor, customer: quote.customer });
      if (thread) {
        const text = `📄 Vendor Revised Quotation:\nTotal: ₹${pricing.totalAmount.toLocaleString('en-IN')}${rawNotes ? '\nNotes: ' + rawNotes : ''}`;
        thread.messages.push({
          sender: 'VENDOR',
          senderName: vendor.businessName || 'Vendor',
          text,
          isRead: false,
          metadata: { type: 'QUOTE_REVISION', quoteId: quote._id, totalAmount: pricing.totalAmount },
          createdAt: new Date(),
        });
        thread.lastMessageText = text;
        thread.lastMessageAt = new Date();
        thread.unreadClientCount = (thread.unreadClientCount || 0) + 1;
        await thread.save();
      }
    } catch (err) {
      console.warn('[vendor-aura] thread sync skipped:', err?.message || err);
    }

    return { kind: 'revise_quote', quoteId: quote._id, quoteRef: quote.quoteReference, total: totalAmount };
  }

  if (a.kind === 'create_quote') {
    const q = a.quote;
    let customerId = q.customerId;
    let opportunityId = q.opportunityId;
    let vendorServiceId = q.vendorServiceId;

    if (!customerId && opportunityId) {
      const opp = await Opportunity.findById(opportunityId);
      if (opp) customerId = opp.customer;
    }
    if (!customerId && q.customerName) {
      const opp = await Opportunity.findOne({
        vendor: vendorId,
        $or: [{ customerName: new RegExp(q.customerName, 'i') }],
      }).populate('customer');
      if (opp) {
        opportunityId = opp._id;
        customerId = opp.customer?._id || opp.customer;
      }
    }
    if (!vendorServiceId) {
      const svc = await VendorService.findOne({ vendor: vendorId, status: 'ACTIVE' });
      if (svc) vendorServiceId = svc._id;
    }
    if (!customerId) {
      throw new Error('CUSTOMER_REQUIRED');
    }

    const basePrice = Math.round(Number(q.basePrice) || 0);
    const travelFee = Math.round(Number(q.travelFee) || 0);
    const totalAmount = Math.round(Number(q.totalAmount) || (basePrice + travelFee));

    const quote = await createQuote({
      opportunityId: opportunityId || null,
      vendorId,
      customerId,
      vendorServiceId,
      serviceName: q.serviceName || 'Event Service',
      eventDate: q.eventDate,
      pricingBreakdown: {
        basePrice,
        travelFee,
        equipmentFee: 0,
        setupFee: 0,
        additionalFee: 0,
        totalAmount,
      },
      notes: q.notes || '',
      status: 'SUBMITTED',
      actor: vendor.businessName || 'Vendor',
    });

    if (opportunityId) {
      await Opportunity.findOneAndUpdate(
        { _id: opportunityId, vendor: vendorId },
        { status: 'RESPONDED', action: 'Quote Sent' }
      );
    }

    try {
      await notifyCustomer({
        customerId: quote.customer,
        title: 'New Quotation Received',
        body: `${vendor.businessName || 'Vendor'} sent a quotation for ${quote.serviceName}: ₹${totalAmount.toLocaleString('en-IN')}.`,
        type: 'quote',
        priority: 'HIGH',
        actionUrl: '/customer/events',
        idempotencyKey: `customer.quote.new.${quote._id}`,
        payload: { quoteId: quote._id },
      });
    } catch (err) {
      console.warn('[vendor-aura] notifyCustomer on create_quote skipped:', err?.message || err);
    }

    return { kind: 'create_quote', quoteId: quote._id, quoteRef: quote.quoteReference, total: totalAmount };
  }

  throw new Error('UNKNOWN_ACTION');
}

// Confirmation patterns (short answers or button texts)
const YES_START = /^\s*(confirm\s*update|confirm\s*block|confirm|send\s*revised\s*offer|send\s*quote|bhej\s*do|kar\s*do|kardo|yes|yeah|yep|ok|okay|sure|save|haan|haa|ha|han|ji|theek|thik|done|go ahead|হ্যাঁ|হাঁ|হ্যা|ঠিক|हाँ|हां|ठीक|जी)(?=[\s!.,]|$)/i;
const NO_START = /^\s*(cancel|no|nope|stop|nahi|nahin|na|mat|rehne do|না|नहीं|नही|मत)(?=[\s!.,]|$)/i;
const HAS_NUMBER = /\d/;

/**
 * Did the vendor answer the pending confirmation? true / false / null.
 */
export function readConfirmation(message) {
  const text = String(message || '').trim();
  const short = text.split(/\s+/).length <= 6 && !HAS_NUMBER.test(text);
  if (NO_START.test(text) && text.split(/\s+/).length <= 6) return false;
  if (YES_START.test(text) && short) return true;
  return null;
}

/**
 * Check if the user message is relevant to the pending action.
 * If the user switches topics (e.g. asks about reviews, ratings, enquiries, bookings,
 * or general questions unrelated to the pending confirmation), returns false so
 * the stale pending state can be safely cleared instead of being dragged along.
 */
export function isMessageRelevantToPending(pending, text) {
  if (!pending || !text) return false;
  const s = String(text).trim().toLowerCase();

  // If user is confirming or cancelling
  if (readConfirmation(text) !== null) return true;

  if (pending.kind === 'block_date') {
    const b = pending.blockout || {};
    if (b.date && s.includes(b.date)) return true;
    if (/\b(date|tarikh|taarikh|block|calendar|calender|reason|notes?|wajah|karan|all\s*day|allday|timing|time|badlo|change|edit|update|rakho|rakhna|kardo|kar\s*do)\b/i.test(s)) {
      return true;
    }
    if (reasonFrom(text)) return true;
    if (dateIn(text)) return true;
    return false;
  }

  if (pending.kind === 'revise_quote' || pending.kind === 'create_quote') {
    const q = pending.quote || {};
    if (q.quoteRef && s.includes(q.quoteRef.toLowerCase())) return true;
    if (q.customerName && s.includes(q.customerName.toLowerCase())) return true;
    if (amountsIn(text).length > 0) return true;
    if (/\b(quote|quotation|offer|price|rate|rupees?|rs|inr|travel|fee|discount|amount|revise|create|bhej|send)\b/i.test(s)) {
      return true;
    }
    return false;
  }

  if (pending.kind === 'service') {
    if (amountsIn(text).length > 0) return true;
    if (/\b(service|price|rate|rupees?|rs|cost|charge|fix|fixed|package)\b/i.test(s)) return true;
    return false;
  }

  if (pending.kind === 'capability') {
    if (/\b(team|gear|equipment|camera|lens|size|people|log|staff|crew)\b/i.test(s)) return true;
    return false;
  }

  if (pending.kind === 'location') {
    if (/\b(location|studio|office|address|pata|city|area|locality)\b/i.test(s)) return true;
    return false;
  }

  if (pending.kind === 'coverage') {
    if (/\b(km|kms|kilometer|kilometre|radius|travel|door|outstation|coverage)\b/i.test(s)) return true;
    return false;
  }

  return false;
}

