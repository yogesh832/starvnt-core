// Pure presentation helpers shared by Vendor Aura's API and chat UI.
const copy = {
  offline: ["Aura's chat service is temporarily unavailable.", 'Aura की चैट सेवा अभी उपलब्ध नहीं है।', 'Aura ki chat service abhi available nahi hai.', 'Aura-র চ্যাট পরিষেবা এখন উপলব্ধ নয়।'],
  settled: ['Total settled','कुल सेटलमेंट','Kul settlement','মোট নিষ্পত্তি'],
  pendingSettlement: ['Pending settlement','बाकी सेटलमेंट','Baaki settlement','বাকি নিষ্পত্তি'],
  paymentsPage: ['Review details on the Payments page.','जानकारी Payments पेज पर देखें।','Jaankari Payments page par dekhein.','বিস্তারিত Payments পেজে দেখুন।'],
  review: ['Review this change', 'बदलाव की पुष्टि करें', 'Badlaav ki pushti karein', 'পরিবর্তনটি দেখুন'],
  pin: ['Move the pin to your entrance', 'पिन अपने प्रवेश द्वार पर रखें', 'Pin apne entrance par rakhein', 'পিন আপনার প্রবেশপথে রাখুন'],
  save: ['Save', 'सेव करें', 'Save karein', 'সংরক্ষণ করুন'],
  cancel: ['Cancel', 'रद्द करें', 'Cancel karein', 'বাতিল করুন'],
  saved: ['Saved', 'सेव कर दिया है', 'Save kar diya hai', 'সংরক্ষণ করা হয়েছে'],
  proposal: ['Here is what I can do:', 'मैं यह कर सकती हूँ:', 'Main yeh kar sakti hoon:', 'আমি এটি করতে পারি:'],
  got: ['Got it.', 'समझ गई।', 'Samajh gayi.', 'বুঝেছি।'],
  confirm: ['Shall I save this? Say “yes” to save or “no” to cancel.', 'क्या मैं इसे सेव कर दूँ? सेव करने के लिए “हाँ”, रद्द करने के लिए “नहीं” कहें।', 'Kya main ise save kar doon? Save karne ke liye “haan”, cancel ke liye “nahi” kahein.', 'এটি সংরক্ষণ করব? সংরক্ষণ করতে “হ্যাঁ”, বাতিল করতে “না” বলুন।'],
  confirmQuote: ['Shall I send this offer? Say “yes” to send or “no” to cancel.', 'क्या मैं यह ऑफर भेज दूँ? भेजने के लिए “हाँ”, रद्द करने के लिए “नहीं” कहें।', 'Kya main yeh offer bhej doon? Bhejne ke liye “haan”, cancel ke liye “nahi” kahein.', 'এই অফার পাঠাব? পাঠাতে “হ্যাঁ”, বাতিল করতে “না” বলুন।'],
  failed: ["I couldn't save that. Please try again, or use the page below.", 'मैं इसे सेव नहीं कर पाई। फिर कोशिश करें या नीचे दिए पेज से करें।', 'Main ise save nahi kar paayi. Phir koshish karein ya neeche diye page se karein.', 'এটি সংরক্ষণ করতে পারিনি। আবার চেষ্টা করুন বা নিচের পেজ ব্যবহার করুন।'],
  cancelled: ["Okay, I didn't save it. Tell me what to change.", 'ठीक है, मैंने इसे सेव नहीं किया। बताइए क्या बदलना है।', 'Theek hai, maine ise save nahi kiya. Bataiye kya badalna hai.', 'ঠিক আছে, সংরক্ষণ করিনি। কী বদলাতে হবে বলুন।'],
  nextServices: ["Next: your first service. What service do you offer, and what's your base price?", 'अब आपकी पहली सर्विस जोड़ती हूँ। आप कौन-सी सर्विस देते हैं और उसकी शुरुआती कीमत क्या है?', 'Ab aapki pehli service jodti hoon. Aap kaun-si service dete hain aur uski shuruaati keemat kya hai?', 'এবার প্রথম পরিষেবা যোগ করি। কী পরিষেবা দেন এবং শুরুর দাম কত?'],
  nextCapabilities: ['Next: team & equipment. How many people are in your team, and what main equipment do you use?', 'अब टीम और उपकरण की जानकारी चाहिए। आपकी टीम में कितने लोग हैं और मुख्य उपकरण कौन-से हैं?', 'Ab team aur equipment ki jaankari chahiye. Aapki team mein kitne log hain aur main equipment kaun-se hain?', 'এবার দল ও সরঞ্জাম। আপনার দলে কতজন আছেন এবং প্রধান সরঞ্জাম কী কী?'],
  locationQuestion: ['What is your business operating address or area and city? You can also select it on the map below.', 'आपके बिज़नेस का operating address या इलाका और शहर क्या है? नीचे मैप पर भी चुन सकते हैं।', 'Aapke business ka operating address ya ilaaka aur city kya hai? Neeche map par bhi chun sakte hain.', 'আপনার ব্যবসার ঠিকানা বা এলাকা এবং শহর কী? নিচের মানচিত্রেও বেছে নিতে পারেন।'],
  nextCoverage: ['How far (in km) from your base do you travel for events?', 'इवेंट के लिए अपने बेस से कितने किलोमीटर तक जाते हैं?', 'Event ke liye apne base se kitne kilometer tak jaate hain?', 'ইভেন্টের জন্য আপনার কেন্দ্র থেকে কত কিলোমিটার যান?'],
  nextAvailability: ['Set your operating days and hours on the Availability page. Event availability still depends on dated bookings and blockouts.', 'Availability पेज पर अपने काम के दिन और समय सेट करें। इवेंट की उपलब्धता बुकिंग और ब्लॉक तारीखों पर निर्भर है।', 'Availability page par apne kaam ke din aur samay set karein. Event availability dated bookings aur blockouts par depend karti hai.', 'Availability পেজে কাজের দিন ও সময় সেট করুন। ইভেন্টের প্রাপ্যতা বুকিং ও ব্লক তারিখের উপর নির্ভর করে।'],
  nextPortfolio: ['Only your portfolio is left. Add your project photos/videos from the Portfolio page.', 'अब केवल पोर्टफोलियो बाकी है। Portfolio पेज से अपने काम की फोटो या वीडियो जोड़ें।', 'Ab sirf portfolio baaki hai. Portfolio page se apne kaam ki photo ya video jodein.', 'এখন শুধু পোর্টফোলিও বাকি। Portfolio পেজে কাজের ছবি বা ভিডিও যোগ করুন।'],
  complete: ['Your profile setup is complete — you can now be matched with customers.', 'आपकी प्रोफाइल सेटअप पूरी है — अब ग्राहकों से मैच हो सकता है।', 'Aapki profile setup poori hai — ab customers se match ho sakta hai.', 'আপনার প্রোফাইল সেটআপ সম্পূর্ণ — এখন গ্রাহকদের সঙ্গে মিল হতে পারে।'],
  verification: ['All six operational setup steps are done. STARVNT verification is still needed before customer matching.', 'सभी छह सेटअप चरण पूरे हैं। ग्राहकों से मैच होने से पहले STARVNT verification बाकी है।', 'Saare chhe setup steps poore hain. Customers se match hone se pehle STARVNT verification baaki hai.', 'ছয়টি ধাপ সম্পূর্ণ। গ্রাহকদের সঙ্গে মেলানোর আগে STARVNT যাচাই বাকি।'],
  mapTitle: ['Choose your operating location', 'अपनी operating location चुनें', 'Apni operating location chunein', 'আপনার ব্যবসার অবস্থান বেছে নিন'],
  mapGuide: ['Search a place or move the pin. Review the address before confirming.', 'जगह खोजें या पिन खिसकाएँ। पुष्टि से पहले पता जाँच लें।', 'Jagah khojein ya pin khiskaayein. Confirm karne se pehle address check karein.', 'জায়গা খুঁজুন বা পিন সরান। নিশ্চিত করার আগে ঠিকানা দেখুন।'],
  address: ['Address / area', 'पता / इलाका', 'Address / ilaaka', 'ঠিকানা / এলাকা'],
  city: ['City', 'शहर', 'City', 'শহর'],
  useLocation: ['Use this location', 'यह location इस्तेमाल करें', 'Yeh location use karein', 'এই অবস্থান ব্যবহার করুন'],
};
export function vendorCopy(language, key) {
  return copy[key]?.[{en:0,hi:1,hinglish:2,bn:3}[language] ?? 0] || key;
}
export function describeVendorAction(a, language = 'en') {
  const index = {en:0,hi:1,hinglish:2,bn:3}[language] ?? 0;
  const choose = (...values) => values[index];
  const money = n => `₹${Number(n).toLocaleString('en-IN')}`;
  if (a.kind === 'service') {
    const s = a.service;
    const rate = s.pricingType === 'FIXED' ? choose('per event','प्रति इवेंट','har event','প্রতি ইভেন্ট') : choose(`per ${s.unit}`,`प्रति ${s.unit}`,`har ${s.unit}`,`প্রতি ${s.unit}`);
    return `${choose('Add service','सर्विस जोड़ें','Service jodein','পরিষেবা যোগ করুন')} “${s.name}” (${s.category}) — ${money(s.basePrice)} ${rate}`;
  }
  if (a.kind === 'location') { const l=a.location; return `${choose('Add operating location','Operating location जोड़ें','Operating location jodein','ব্যবসার অবস্থান যোগ করুন')} “${l.label}” — ${[l.address,l.city,l.state,l.postalCode].filter(Boolean).join(', ')}`; }
  if (a.kind === 'capability') { const c=a.capability; return `${choose('Team & equipment','टीम और उपकरण','Team aur equipment','দল ও সরঞ্জাম')} — “${c.serviceName}”: ${c.teamSize}; ${c.equipment.join(', ')}`; }
  if (a.kind === 'coverage') { const c=a.coverage; return `${choose('Coverage','कवरेज','Coverage','পরিষেবার এলাকা')} — “${c.serviceName}”: ${c.radiusKm} km${c.city ? ` (${c.city})` : ''}`; }
  if (a.kind === 'block_date') return `${choose('Calendar date','कैलेंडर की तारीख','Calendar ki tareekh','ক্যালেন্ডারের তারিখ')}: ${a.blockout.date}${a.blockout.reason ? ` — ${a.blockout.reason}` : ''}`;
  if (a.quote) return `${choose('Offer','ऑफर','Offer','অফার')} ${a.quote.quoteRef || ''} — ${a.quote.customerName || ''} — ${money(a.quote.totalAmount)}${a.quote.basePrice != null ? ` · ${choose('Base','बेस','Base','মূল')}: ${money(a.quote.basePrice)}` : ''}${a.quote.travelFee ? ` · ${choose('Travel','यात्रा','Travel','যাতায়াত')}: ${money(a.quote.travelFee)}` : ''}${a.quote.notes ? ` — ${a.quote.notes}` : ''}`;
  return '';
}
export function requestsVendorLocation(reply) {
  const text = String(reply || '');
  return /[?？]/.test(text) && /(?:operating address|studio.*location|office.*location|address.*(?:city|area)|address ya|where.*(?:business|studio|office)|(?:which|what).*operating.*location|location.*(?:area|city|address)|पता|इलाका.*शहर|ঠিকানা)/i.test(text);
}
export function normalizeVendorLocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clean = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
  const lat=raw.coordinates?.lat, lng=raw.coordinates?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
  const address=clean(raw.address,200), city=clean(raw.city,80);
  if (!address || !city) return null;
  return {label:clean(raw.label,80)||'Operating location',type:'HEAD_OFFICE',address,locality:clean(raw.locality,80),city,state:clean(raw.state,60),postalCode:clean(raw.postalCode,12),coordinates:{lat,lng}};
}

export function isVendorLocationSetupRequest(message) {
  return /(?:\b(?:set|add|choose|select|pin|update)\b.{0,45}\b(?:location|address)\b|\blocation\b.{0,45}\b(?:set|add|choose|select|pin|map)\b|\bmap\b.{0,35}\b(?:chun|chunna|dikhao|select|choose)\b|लोकेशन.{0,35}(?:सेट|मैप|चुन)|(?:पता|जगह).{0,35}(?:मैप|चुन)|(?:ঠিকানা|অবস্থান).{0,35}(?:যোগ|মানচিত্র|বেছে))/i.test(String(message || ''));
}
