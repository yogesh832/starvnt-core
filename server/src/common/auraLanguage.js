const HINDI = /[\u0900-\u097f]/;
const BENGALI = /[\u0980-\u09ff]/;
// Roman-script Bengali; only words that do not occur in Hinglish.
const ROMAN_BENGALI = /\b(ami|amar|amader|apnar|tumi|tomar|kemon|biye|korbo|korte|korun|lagbe|bolun|hobe|chaichhi|janen|dekhun|thik ache)\b/i;
const EXPLICIT_BENGALI = /\b(?:in bengali|in bangla|bengali (?:please|te|e)|bangla(?:te|y|e)? (?:bolo|bolun|please)|bangla te|banglay|reply.*bengali|speak.*bengali)\b|\u09ac\u09be\u0982\u09b2\u09be\u09af\u09bc/i;
const HINGLISH = /\b(mujhe|mera|meri|mere|hamara|humara|shaadi|shadi|chahiye|karna|karni|karo|batao|kitne|kitna|kaise|kahan|hain|nahi|nahin|haan|hoga|hogi|aap|hai|kripya|madad|karein|intezaam|jaankari)\b/i;

/** Short facts and chip answers retain the conversation language. */
export function conversationLanguage(message = '', history = [], preferredLanguage = null) {
  const previousReply = [...history].reverse().find(m => m.role !== 'user')?.content || '';
  let language = preferredLanguage || (/[\u0980-\u09ff]/.test(previousReply) ? 'bn' : HINDI.test(previousReply) ? 'hi' : HINGLISH.test(previousReply) ? 'hinglish' : 'en');
  for (const text of [...history.filter(m => m.role === 'user').map(m => String(m.content || '')), message]) {
    if (!text.trim()) continue;
    const explicitRoman = /\b(?:roman (?:hindi|script)|hinglish)\b/i.test(text);
    const explicitHindi = /\b(?:in hindi|hindi please)\b/i.test(text);
    if (explicitRoman) { language = 'hinglish'; continue; }
    if (explicitHindi) { language = 'hi'; continue; }
    if (EXPLICIT_BENGALI.test(text)) { language = 'bn'; continue; }
    if (/\b(in english|english (please|mein|me)|reply.*english|speak.*english)\b/i.test(text)) { language = 'en'; }
    else if (BENGALI.test(text)) { language = 'bn'; }
    else if (HINDI.test(text)) { language = 'hi'; }
    else if (ROMAN_BENGALI.test(text) && !HINGLISH.test(text)) { language = 'bn'; }
    else if (HINGLISH.test(text)) {
      if (!/^(haan|nahi|nahin|ji|haan ji)[.!\s]*$/i.test(text)) { language = 'hinglish'; }
    // Place names and short factual fragments can contain four or more words
    // without being an English language switch ("kapkote bazar ke paas").
    } else if (/\b(i(?:'m| am| would| want| need| have| had| will| offer)|we (?:are|want|need|have|will)|(?:can|could|would) you|how (?:do|can|should) (?:i|we)|help me|please (?:find|show|help|tell)|(?:show|find|tell|recommend) (?:me|us)|(?:it|this|that) (?:is|will|should))\b/i.test(text)) { language = 'en'; }
  }
  return language;
}

export function auraLanguageInstruction(language) {
  const label = { hi: 'Hindi in Devanagari script', bn: 'Bengali in Bengali script', hinglish: 'Roman-script Hinglish', en: 'English' }[language] || 'English';
  return `Continue in ${label}, including the next question, confirmations, action labels and saved-result follow-ups. This language is chosen from the user's messages and overrides language mistakes in earlier assistant replies. Preserve the selected script; do not alternate Roman Hindi and Devanagari. Short dates, numbers, place names and yes/no answers do not change the conversation language. Aura is a feminine speaker: use feminine first-person Hindi/Hinglish forms ("मैं मदद कर सकती हूँ", "मैं देख रही हूँ", "main madad kar sakti hoon", "main dekh rahi hoon"). Do not infer or change the customer's gender. English remains natural and gender-neutral.`;
}

const categories = {
  venue: ['वेन्यू', 'venue'], catering: ['कैटरिंग', 'catering'], photography: ['फोटोग्राफी', 'photography'], decor: ['सजावट', 'decor'], makeup: ['मेकअप', 'makeup'], sound: ['साउंड, डीजे या माइक', 'sound, DJ ya mic'], ceremony: ['पूजा या रस्मों', 'puja ya rasmon'], transport: ['ट्रांसपोर्ट', 'transport'], accommodation: ['ठहरने', 'rehne'], hospitality: ['मेहमानों की देखभाल', 'mehmaanon ki dekhbhaal'], invitation: ['निमंत्रण', 'invitation'], anchor: ['एंकर', 'anchor'], entertainment: ['मनोरंजन', 'entertainment'], photo_booth: ['फोटो बूथ', 'photo booth'], special_effects: ['स्पेशल इफेक्ट्स', 'special effects'], live_streaming: ['लाइव स्ट्रीमिंग', 'live streaming'], cake: ['केक', 'cake'], corporate_production: ['इवेंट प्रोडक्शन', 'event production'],
};
const optionWords = {
  'Skip for now': ['अभी छोड़ें', 'Abhi chhodein'], 'Not decided yet': ['अभी तय नहीं है', 'Abhi tay nahi hai'],
  'Yes, I already have one': ['हाँ, इंतज़ाम हो गया है', 'Haan, intezaam ho gaya hai'], 'Help me find one': ['ढूँढने में मदद करें', 'Dhoondhne mein madad karein'],
  'Set my own budget': ['अपना बजट बताऊँ', 'Apna budget bataun'], 'At the event venue': ['इवेंट के वेन्यू पर', 'Event ke venue par'], 'Somewhere else': ['किसी और जगह', 'Kisi aur jagah'], 'Enter pickup place': ['पिकअप की जगह बताऊँ', 'Pickup ki jagah bataun'],
  Wedding: ['शादी', 'Shaadi'], Birthday: ['जन्मदिन', 'Birthday'], 'Corporate event': ['कॉर्पोरेट इवेंट', 'Corporate event'], Puja: ['पूजा', 'Puja'], Anniversary: ['सालगिरह', 'Saalgirah'], 'Something else': ['कुछ और', 'Kuch aur'],
};

const BN_CATEGORIES = {
  venue: 'ভেন্যু', catering: 'ক্যাটারিং', photography: 'ফটোগ্রাফি', decor: 'সাজসজ্জা', makeup: 'মেকআপ', sound: 'সাউন্ড, ডিজে বা মাইক', ceremony: 'পুজো বা অনুষ্ঠানের আচার', transport: 'যাতায়াত', accommodation: 'থাকার ব্যবস্থা', hospitality: 'অতিথি আপ্যায়ন', invitation: 'নিমন্ত্রণ', anchor: 'অ্যাঙ্কর', entertainment: 'বিনোদন', photo_booth: 'ফটো বুথ', special_effects: 'স্পেশাল এফেক্টস', live_streaming: 'লাইভ স্ট্রিমিং', cake: 'কেক', corporate_production: 'ইভেন্ট প্রোডাকশন',
};
const BN_OPTIONS = {
  'Skip for now': 'এখন থাক', 'Not decided yet': 'এখনও ঠিক হয়নি', 'Yes, I already have one': 'হ্যাঁ, ব্যবস্থা হয়ে গেছে', 'Help me find one': 'খুঁজে দিতে সাহায্য করুন',
  'Set my own budget': 'নিজের বাজেট বলি', 'At the event venue': 'অনুষ্ঠানের ভেন্যুতে', 'Somewhere else': 'অন্য কোথাও', 'Enter pickup place': 'পিকআপের জায়গা বলি',
  Wedding: 'বিয়ে', Birthday: 'জন্মদিন', 'Corporate event': 'কর্পোরেট ইভেন্ট', Puja: 'পুজো', Anniversary: 'বিবাহবার্ষিকী', 'Something else': 'অন্য কিছু',
};

function localizeBengaliQuestion(question, event) {
  const topic = question.topic;
  const eventQuestions = {
    'event.type': 'কী ধরনের অনুষ্ঠান পরিকল্পনা করতে চান?',
    'event.date': 'আপনার অনুষ্ঠান কোন তারিখে?',
    'event.city': 'অনুষ্ঠান কোন শহরে হবে?',
    'event.guest_count': 'আনুমানিক কতজন অতিথি আসবেন?',
    'event.area': `${event?.location?.venueName || 'ভেন্যু'} ${event?.city || 'শহরের'} কোন এলাকায়?`,
    'event.budget': 'আপনার আনুমানিক বাজেট কত?',
    'location.makeup': 'মেকআপ কোথায় হবে?', 'location.transport': 'অতিথিদের কোথা থেকে পিকআপ করতে হবে?',
    'location.accommodation': 'অতিথিরা কোথায় থাকবেন?', 'location.ceremony': 'পুজো বা আচার কোথায় হবে?',
  };
  const category = topic?.split('.')[1], name = BN_CATEGORIES[category] || 'এই পরিষেবা';
  let text = eventQuestions[topic];
  if (topic?.startsWith('requirement.')) text = `${name}-এর ব্যবস্থা কি হয়ে গেছে?`;
  return { ...question, language: 'bn', question: text || question.question, options: (question.options || []).map(option => {
    if (typeof option === 'string') return BN_OPTIONS[option] || option;
    const out = { ...option, label: BN_OPTIONS[option.label] || option.label };
    // Preserve structured actions (skipTopic, budgetRange, serviceLocation).
    if (out.message && topic === 'event.type') out.message = `${out.label} পরিকল্পনা করতে চাই।`;
    else if (out.message && topic?.startsWith('requirement.')) out.message = `অনুগ্রহ করে ${name} খুঁজে দিতে সাহায্য করুন।`;
    if (out.prefill) out.prefill = topic === 'event.budget' ? 'আমার বাজেট ₹' : topic === 'event.type' ? 'আমার অনুষ্ঠান: ' : topic?.startsWith('location.') ? `${name}-এর জায়গা: ` : `আমার অনুষ্ঠানের জন্য ${name}-এর ব্যবস্থা আছে: `;
    return out;
  }) };
}

export function localizeAuraQuestion(question, language, event = null) {
  if (question && language === 'bn') return localizeBengaliQuestion(question, event);
  if (!question || !['hi', 'hinglish'].includes(language)) return question ? { ...question, language } : null;
  const hi = language === 'hi', index = hi ? 0 : 1, topic = question.topic;
  const eventQuestions = {
    'event.type': ['किस तरह का इवेंट प्लान करना है?', 'Kis tarah ka event plan karna hai?'],
    'event.date': ['आपका इवेंट किस तारीख को है?', 'Aapka event kis tareekh ko hai?'],
    'event.city': ['आपका इवेंट कहाँ होगा? नीचे लोकेशन खोजकर सही शहर या इलाका चुनें।', 'Aapka event kahan hoga? Neeche location search karke sahi shehar ya area chunein.'],
    'event.guest_count': ['लगभग कितने मेहमान आएँगे?', 'Lagbhag kitne mehmaan aayenge?'],
    'event.area': [`${event?.location?.venueName || 'वेन्यू'} ${event?.city || 'शहर'} के किस इलाके में है?`, `${event?.location?.venueName || 'Venue'} ${event?.city || 'shehar'} ke kis ilaake mein hai?`],
    'event.budget': ['आपका लगभग कितना बजट है?', 'Aapka lagbhag kitna budget hai?'],
    'location.makeup': ['मेकअप कहाँ होगा?', 'Makeup kahan hoga?'], 'location.transport': ['मेहमानों को कहाँ से पिकअप करना है?', 'Mehmaanon ko kahan se pickup karna hai?'],
    'location.accommodation': ['मेहमान कहाँ ठहरेंगे?', 'Mehmaan kahan rahenge?'], 'location.ceremony': ['पूजा या रस्में कहाँ होंगी?', 'Puja ya rasmein kahan hongi?'],
  };
  const category = topic?.split('.')[1], name = categories[category]?.[index] || (hi ? 'इस सेवा' : 'is service');
  let text = eventQuestions[topic]?.[index];
  if (topic?.startsWith('requirement.')) text = hi ? `क्या ${name} का इंतज़ाम हो गया है?` : `Kya ${name} ka intezaam ho gaya hai?`;
  return { ...question, language, question: text || question.question, options: (question.options || []).map(option => {
    if (typeof option === 'string') return optionWords[option]?.[index] || option;
    const out = { ...option, label: optionWords[option.label]?.[index] || option.label };
    // Preserve structured actions (skipTopic, budgetRange, serviceLocation).
    if (out.message && topic === 'event.type') out.message = hi ? `${out.label} प्लान करना है।` : `${out.label} plan karna hai.`;
    else if (out.message && topic?.startsWith('requirement.')) out.message = hi ? `कृपया ${name} ढूँढने में मदद करें।` : `${name} dhoondhne mein madad karein.`;
    if (out.prefill) out.prefill = topic === 'event.budget' ? (hi ? 'मेरा बजट ₹' : 'Mera budget ₹') : topic === 'event.type' ? (hi ? 'मेरा इवेंट: ' : 'Mera event: ') : topic?.startsWith('location.') ? (hi ? `${name} की जगह: ` : `${name} ki jagah: `) : (hi ? `मेरे इवेंट के लिए ${name} का इंतज़ाम है: ` : `Mere event ke liye ${name} ka intezaam hai: `);
    return out;
  }) };
}
