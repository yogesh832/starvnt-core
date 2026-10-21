const nouns = { enquiry: /enquir|inquir|leads?|पूछताछ|लीड/i, quote: /quotes?|quotation|offers?|कोट|प्रस्ताव/i, booking: /bookings?|execution|completion|बुकिंग|काम.*स्थिति/i, payment: /payments?|advance|पेमेंट|भुगतान|अग्रिम/i, notification: /notifications?|alerts?|सूचना/i };
export function activityAnswer(message, activity, language = 'en') {
  // Detailed enquiry analysis needs the scoped enquiry context, not just titles.
  if (/enquir|inquir|lead/i.test(message) && /requirement|detail|analyse|analyze|availability|working hours|guest|location|customer ki/i.test(message)) return null;
  if (!activity || /\b(create|send|revise|edit|cancel|delete|mark|approve|verify|release|change|bhej[a-z]*|banwa[a-z]*)\b|भेज|बना दो|रद्द|बदल/i.test(message)) return null;
  if (!/\?|\b(show|list|status|latest|new|update|updates|changed|how many|what|which|any)\b|क्या|कितन|दिखा|स्थिति|नया|नई|dikha|kitn|kya|naya|nayi/i.test(message)) return null;
  const kind = Object.entries(nouns).find(([, expression]) => expression.test(message))?.[0];
  const general = /what.*changed|latest updates|what.*new|क्या.*बदल|नया क्या/i.test(message);
  if (!kind && !general) return null;
  // Leave date/customer-specific analysis to the full context-aware path.
  if (/\b(today|tomorrow|yesterday|week|month|between|before|after|for customer)\b|आज|कल|हफ्त|सप्ताह|महीन/i.test(message)) return null;
  if (/\b(show|list|how many|which)\b.*\b(paid|verified|failed|cancelled|confirmed|accepted|expired)\b/i.test(message)) return null;
  const reference = message.match(/\b(?:BK|QT)-[\w-]+/i)?.[0];
  // Counts refer to the complete owned set; cards only contain the recent window.
  const newOnly = kind === 'enquiry' && /\bnew\b|नई|नयी|नए|nayi|naye/i.test(message);
  const unreadOnly = kind === 'notification' && /unread|अनपढ़/i.test(message);
  const needsReply = kind === 'enquiry' && /pending|need.*reply|reply.*pending/i.test(message);
  const matching = activity.items.filter(row => (!kind || row.kind === kind || (kind === 'payment' && row.paymentStatus)) && (!newOnly || row.status === 'NEW') && (!unreadOnly || row.status === 'UNREAD') && (!needsReply || ['NEW', 'VIEWED'].includes(row.status)) && (!reference || row.reference?.toLowerCase() === reference.toLowerCase()));
  const rows = matching.slice(0, 3);
  const hi = language === 'hi', hinglish = language === 'hinglish';
  const opening = hi ? 'अभी के सेव किए गए रिकॉर्ड के अनुसार:' : hinglish ? 'Abhi ke saved records ke mutabik:' : 'According to the current saved records:';
  const lines = rows.map(row => {
    const state = [row.status, row.paymentStatus && `payment: ${row.paymentStatus}`, row.executionStatus && `work: ${row.executionStatus}`, row.settlementStatus && `settlement: ${row.settlementStatus}`].filter(Boolean).join('; ').toLowerCase().replaceAll('_', ' ');
    return `${row.title}${row.reference ? ` (${row.reference})` : ''}: ${state}${row.total != null ? ` · ₹${row.total.toLocaleString('en-IN')}` : ''}`;
  });
  const countKey = newOnly ? 'newEnquiries' : { quote: 'quotes', booking: 'bookings', notification: 'unread' }[kind];
  const wantsCount = /how many|कितन|kitn/i.test(message) && countKey && !reference && !needsReply && (kind !== 'notification' || unreadOnly);
  const countText = wantsCount ? `${hi ? 'कुल' : hinglish ? 'Kul' : 'Total'}: ${activity.counts[countKey]}.\n` : '';
  const quoteNote = kind === 'enquiry' && nouns.quote.test(message) && Number.isInteger(activity.counts?.quotes) ? `\n${activity.counts.quotes === 0 ? hi ? 'अभी वेंडर का कोई कोट नहीं आया है।' : hinglish ? 'Abhi vendor ka koi quote nahi aaya hai.' : 'No vendor quote has arrived yet.' : `Saved quotes: ${activity.counts.quotes}`}` : '';
  return { reply: countText + (lines.length ? `${opening}\n${lines.join('\n')}` : hi ? 'हाल के रिकॉर्ड में ऐसा कोई रिकॉर्ड नहीं है।' : hinglish ? 'Recent records mein aisa koi record nahi hai.' : 'There are no matching records in the recent activity window.') + quoteNote, actions: [...new Map(rows.filter(row => row.href).map(row => [row.href, { label: 'View records', to: row.href }])).values()].slice(0, 3) };
}
