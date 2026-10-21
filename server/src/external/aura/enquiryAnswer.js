/** Read-only guidance derived from this vendor's saved enquiries and dated calendar blockouts. */
export function enquiryAnswer(text, context, language = 'en') {
  if (!/enquir|inquir|lead/i.test(text) || !/requirement|detail|analyse|analyze|availability|working hours|guest|location|customer ki/i.test(text)) return null;
  const open = context.enquiries?.open || [];
  const lower = text.toLowerCase();
  const named = open.filter(row => (row.customer && lower.includes(row.customer.toLowerCase().split(' ')[0])) || (row.ref && lower.includes(row.ref.toLowerCase())) || (row.id && lower.includes(row.id)));
  const hi = language === 'hi', hinglish = language === 'hinglish';
  const requestedName = /(?:^|\s)([\p{L}]+(?:\s+[\p{L}]+)?)\s+(?:ki|ka|ke|'s)\s+(?:enquiry|inquiry|lead)\b/iu.exec(text)?.[1];
  if (!named.length && requestedName && !/^(meri|mere|mera|is|iss|us|uss|customer|client|new|nayi|latest)(?:\s|$)/i.test(requestedName)) return { reply: hi ? 'इस ग्राहक की पूछताछ मौजूदा खुली सूची में नहीं मिली। कृपया नाम या रेफरेंस जाँचें।' : hinglish ? 'Is customer ki enquiry current open list mein nahi mili. Naam ya reference check kar lein.' : 'That customer was not found in the current open-enquiry list. Check the name or reference.', actions: [{ label: 'View enquiries', to: '/vendor/enquiries' }] };
  const rows = named.length ? named : open;
  if (!rows.length) return { reply: hi ? 'अभी आपकी कोई खुली पूछताछ नहीं दिख रही है।' : hinglish ? 'Abhi aapki koi open enquiry nahi dikh rahi hai.' : 'There are no saved open enquiries for your business.', actions: [{ label: 'View enquiries', to: '/vendor/enquiries' }] };
  let calendarConflict = false;
  const blocks = rows.slice(0, 5).map(row => {
    const date = row.eventDate ? String(row.eventDate).slice(0, 10) : null;
    const facts = [row.customer, row.service, row.eventDate, row.guests != null ? `${row.guests} guests` : null, row.place, `Status: ${row.status}`, row.requirement && `Customer brief: ${row.requirement.replace(/customerBrief:/g, 'Customer request:')}`].filter(Boolean).join('\n');
    // Weekly office hours do not restrict event service dates, including Sundays.
    const warning = hi ? 'पूछताछ बुकिंग नहीं है। जवाब देने से पहले समय और उपलब्धता जाँचें।' : hinglish ? 'Enquiry booking nahi hai. Jawab dene se pehle timing aur availability check karein.' : 'An enquiry is not a booking. Check timing and availability before replying.';
    const blocked = date && context.blockedDates?.some(block => String(block.date).slice(0, 10) === date);
    if (blocked) calendarConflict = true;
    const blockWarning = !blocked ? '' : hi ? '\nइस तारीख पर एक सेव किया गया ब्लॉकआउट भी है। जवाब देने से पहले उसका समय जाँचें।' : hinglish ? '\nIs date par saved blockout bhi hai. Jawab dene se pehle uska time check karein.' : '\nThere is also a saved blockout on this date. Check its time before replying.';
    const counts = row.commercial || (context.activity?.counts?.quotes === 0 && context.activity?.counts?.bookings === 0 ? { quotes: 0, bookings: 0 } : null);
    const commercial = !/quote|book/i.test(text) ? '' : Number.isInteger(counts?.quotes) && Number.isInteger(counts?.bookings) ? `\n${hi ? 'इस पूछताछ के सेव किए गए कोट' : 'Saved quotes'}: ${counts.quotes} · ${hi ? 'बुकिंग' : 'bookings'}: ${counts.bookings}.` : hi ? '\nइस पूछताछ का कोट/बुकिंग विवरण अभी उपलब्ध नहीं है।' : hinglish ? '\nIs enquiry ka exact quote/booking status abhi available nahi hai.' : '\nExact quote/booking status for this enquiry is unavailable.';
    return `${facts}\n${warning}${blockWarning}${commercial}`;
  });
  const incomplete = context.business?.matchingEligible === false || context.profileSetup?.complete === false;
  const missing = (context.business?.missingForActivation || []).filter(value => typeof value === 'string').slice(0, 5);
  const readiness = !incomplete ? '' : hi ? `\n\nप्रोफाइल/एक्टिवेशन की ज़रूरतें अभी अधूरी हैं; नए ग्राहक से मिलान सक्रिय न मानें।${missing.length ? ` बाकी: ${missing.join(', ')}.` : ''} Business setup में असली विवरण और दस्तावेज़ पूरे करें।` : hinglish ? `\n\nProfile/activation ki requirements abhi incomplete hain; new customer matching ko active na maanein.${missing.length ? ` Baaki: ${missing.join(', ')}.` : ''} Business setup mein asli details aur documents complete karein.` : `\n\nProfile/activation requirements are incomplete; do not assume new customer matching is active.${missing.length ? ` Still needed: ${missing.join(', ')}.` : ''} Complete the actual details and documents in business setup.`;
  const actions = [{ label: 'View enquiries', to: '/vendor/enquiries' }];
  if (incomplete) actions.push({ label: 'Review business setup', to: '/vendor/profile' });
  if (calendarConflict) actions.push({ label: 'Review calendar', to: '/vendor/availability' });
  return { reply: blocks.join('\n\n') + readiness, actions };
}
