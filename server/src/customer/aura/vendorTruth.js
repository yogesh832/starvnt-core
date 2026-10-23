import { categoriesMentioned } from '../services/planCatalog.js';
import { parseProvidedCategories, parseStatedNeeds, parseStatedEventType, parseDate, parseGuests, parseBudget } from './factBackfill.js';

export function isVendorRequest(text) {
  if (/\b(booked|paid|refund|cancel|payment|settlement|my bookings)\b|भुगतान|रिफंड/iu.test(text)) return false;
  const provided = new Set(parseProvidedCategories(text));
  if (parseStatedNeeds(text).some(category => !provided.has(category))) return true;
  if (/\b(already have|already arranged|don't need|do not need|no need)\b|मेरे पास|इंतज़ाम हो गया/iu.test(text)) return false;
  return categoriesMentioned(text).length > 0 || /\b(vendors?|packages?|catalog|catalogue|photographers?|caterers?|pricing|prices?|rates?|availability|available|help me find|find one)\b|वेंडर|फोटोग्राफ|कैटर|कीमत|रेट|उपलब्ध|ढूँढ|dhoondh/iu.test(text);
}

export const isCatalogLookupOnly = text => {
  const planning = parseStatedEventType(text) && (parseDate(text) || parseGuests(text) || parseBudget(text));
  const enquiry = /enquir|inquir|quote/i.test(text) && /bhej|send|contact|kaise|how|aage/i.test(text);
  return !planning && isVendorRequest(text) && (enquiry || /\b(show|list|find|recommend|suggest|compare|which|what|how much|pricing|prices?|rates?|cost|available|availability)\b|दिखा|कौन|कितन|कीमत|रेट|उपलब्ध|ढूँढ|dhoondh|dikhao|dikhaiye/iu.test(text));
};
export const scopeMatchesEvent = (scope, event) => !!event && ['city', 'eventDate', 'guestCount'].every(key => String(scope?.[key] ?? '').toLowerCase() === String(event[key] ?? '').toLowerCase());

export function selectVendorRows(rows, message) {
  const query = message.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ');
  const words = new Set(query.split(/\s+/).filter(word => word.length > 2));
  const generic = new Set('wedding birthday event events photography photographer catering caterer decoration decor venue sound makeup band studio and the for in near vendor vendors party price rate prices available availability show tell find need want planning'.split(' '));
  const named = rows.filter(row => {
    const name = row.vendor.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
    const significant = name.split(/\s+/).filter(word => word.length > 2 && !generic.has(word));
    return query.includes(name) || significant.filter(word => words.has(word)).length >= 2;
  });
  const provided = new Set(parseProvidedCategories(message));
  const needs = parseStatedNeeds(message).filter(category => !provided.has(category));
  const packageMatches = rows.filter(row => {
    const distinct = String(row.package || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(word => word.length > 1 && !generic.has(word) && !['package', 'photos', 'video', 'photography'].includes(word));
    return distinct.length >= 2 && distinct.filter(word => words.has(word) || query.split(' ').includes(word)).length >= Math.max(2, Math.ceil(distinct.length * 0.7));
  });
  const categories = needs.length ? needs : categoriesMentioned(message).filter(category => !provided.has(category));
  const packageWithinNamed = packageMatches.filter(row => named.includes(row));
  // A named package that has left the live catalogue must not broaden into
  // unrelated vendors on the next poll (for example after eligibility changes).
  const packagePhrase = /(.{0,100})\bpackage\b/i.exec(message)?.[1] || '';
  // A named vendor is not a named package. Otherwise "Kumaon Catering ka
  // catering package" is incorrectly rejected when its package is just Catering.
  const vendorWords = new Set(named.flatMap(row => row.vendor.toLowerCase().split(/[^\p{L}\p{N}]+/u)));
  const specificPackage = packagePhrase.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1 && !generic.has(word) && !vendorWords.has(word) && !['aur', 'wala', 'wali', 'hazaar', 'ka', 'ki', 'ke', 'ko', 'hai', 'me', 'mujhe'].includes(word)).length >= 2;
  if (specificPackage && !packageMatches.length) return [];
  return (packageWithinNamed.length ? packageWithinNamed : named.length ? named : packageMatches.length ? packageMatches : categories.length ? rows.filter(row => categories.includes(row.category)) : rows).sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || Number(['booked', 'blocked'].includes(a.availability)) - Number(['booked', 'blocked'].includes(b.availability)) || (a.price ?? Infinity) - (b.price ?? Infinity));
}

export function vendorPrice(row) {
  if (row.requiresVendorConfirmation) return 'Final price needs vendor confirmation';
  if (row.price != null) return `₹${row.price.toLocaleString('en-IN')} listed total`;
  if (row.basePrice != null) return `₹${row.basePrice.toLocaleString('en-IN')} / ${row.unit || row.pricingType?.toLowerCase() || 'unit'}; total not confirmed`;
  return 'No price listed';
}

/** All names, amounts and counts come directly from the shared customer catalogue. */
export function vendorTruthReply(rows, scope, language = 'en', query = '') {
  const total = new Set(rows.map(row => row.vendorId || row.vendor)).size;
  const place = scope?.city || null;
  if (!rows.length) return language === 'hi' ? `अभी API में${place ? ` ${place} के लिए` : ''} इस खोज से मेल खाती कोई सक्रिय सर्विस नहीं मिली। मैं कोई नाम या कीमत नहीं बना सकती।` : language === 'hinglish' ? `Abhi API mein${place ? ` ${place} ke liye` : ''} is search se matching koi active service nahi mili. Main koi naam ya keemat nahi bana sakti.` : `The catalogue API returned no matching active services${place ? ` for ${place}` : ''}. I can't verify a vendor or price for this search.`;
  const examples = rows.slice(0, 3).map(row => `${row.vendor}${row.isDemo ? ' (demo listing)' : ''} — ${row.package}: ${vendorPrice(row)}${row.availability === 'blocked' ? ' · blocked on this date' : row.availability === 'booked' ? ' · booked on this date' : ''}`).join('; ');
  const count = language === 'hi' ? `API में${place ? ` ${place} के लिए` : ''} ${total} वेंडर की ${rows.length} सर्विस दिख रही हैं।` : language === 'hinglish' ? `API mein${place ? ` ${place} ke liye` : ''} ${total} vendors ki ${rows.length} services dikh rahi hain.` : `The catalogue API lists ${rows.length} services from ${total} vendors${place ? ` for ${place}` : ''}.`;
  const caution = language === 'hi' ? `${!place ? 'शहर बताएँ ताकि कवरेज जाँच सकूँ। ' : ''}${!scope?.eventDate ? 'तारीख के बिना उपलब्धता नहीं बता सकती।' : 'कैलेंडर की स्थिति कार्ड पर है; यह वेंडर की पक्की मंज़ूरी नहीं है।'} अंतिम कीमत और अतिरिक्त शुल्क वेंडर से पक्के होंगे।` : language === 'hinglish' ? `${!place ? 'Shehar batayein taaki coverage jaanch sakun. ' : ''}${!scope?.eventDate ? 'Tareekh ke bina availability nahi bata sakti.' : 'Calendar status card par hai; yeh vendor ki pakki manzoori nahi hai.'} Final price aur extra charges vendor se confirm honge.` : `${!place ? 'Tell me the city to check service coverage. ' : ''}${!scope?.eventDate ? 'Availability needs an event date.' : 'Calendar status is shown on each card; it is not vendor confirmation.'} Final price and additional charges need vendor confirmation.`;
  const wantsEnquiry = /enquir|inquir|quote|baat.*(?:kaise|hogi)|contact/i.test(query);
  const next = !wantsEnquiry ? '' : scope?.status === 'draft' || !scope?._id ? (language === 'hi' ? 'पहले इवेंट कार्ड पर विवरण जाँचकर Build My Event Plan दबाएँ। फिर सर्विस चुनकर पूछताछ भेज सकती हैं।' : language === 'hinglish' ? 'Pehle event card ke details check karke Build My Event Plan dabayein. Phir service chun kar enquiry bhej sakti hain.' : 'First check the event card and choose Build My Event Plan, then select a service to send an enquiry.') : (language === 'hi' ? 'इस सर्विस कार्ड पर View service details खोलें, Select & enquire दबाएँ। इससे चुने हुए वेंडर को पूछताछ जाएगी। Get a quote पर उसका जवाब देख सकती हैं; इससे बुकिंग या पेमेंट नहीं होगा।' : language === 'hinglish' ? 'Is service card par View service details kholein, Select & enquire dabayein. Isse chune hue vendor ko enquiry jayegi. Get a quote par uska jawab dekh sakti hain; isse booking ya payment nahi hoga.' : 'Open View service details on the matching card, choose Select & enquire to send the chosen vendor an enquiry. Get a quote shows their response; this does not book or pay the vendor.');
  return `${count}\n\n${examples}\n\n${caution}${next ? `\n\n${next}` : ''}`;
}
