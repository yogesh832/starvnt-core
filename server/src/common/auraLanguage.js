const HINDI = /[\u0900-\u097f]/;
const HINGLISH = /\b(mujhe|mera|meri|mere|hamara|humara|shaadi|shadi|chahiye|karna|karni|karo|batao|kitne|kitna|kaise|kahan|hain|nahi|nahin|haan|hoga|hogi|aap|hai|kripya|madad|karein|intezaam|jaankari)\b/i;

/** Short facts and chip answers retain the conversation language. */
export function conversationLanguage(message = '', history = []) {
  const previousReply = [...history].reverse().find(m => m.role !== 'user')?.content || '';
  let language = /[\u0980-\u09ff]/.test(previousReply) ? 'bn' : HINDI.test(previousReply) ? 'hi' : HINGLISH.test(previousReply) ? 'hinglish' : 'en';
  for (const text of [...history.filter(m => m.role === 'user').map(m => String(m.content || '')), message]) {
    if (!text.trim()) continue;
    if (/\b(in english|english (please|mein|me)|reply.*english|speak.*english)\b/i.test(text)) language = 'en';
    else if (/[\u0980-\u09ff]/.test(text)) language = 'bn';
    else if (HINDI.test(text)) language = 'hi';
    else if (HINGLISH.test(text)) {
      if (!/^(haan|nahi|nahin|ji|haan ji)[.!\s]*$/i.test(text)) language = 'hinglish';
    // Place names and short factual fragments can contain four or more words
    // without being an English language switch ("kapkote bazar ke paas").
    } else if (/\b(i(?:'m| am| would| want| need| have| will)|we (?:are|want|need|have|will)|(?:can|could|would) you|please (?:find|show|help|tell)|(?:show|find|tell|recommend) (?:me|us)|(?:it|this|that) (?:is|will|should))\b/i.test(text)) language = 'en';
  }
  return language;
}

export function auraLanguageInstruction(language) {
  const label = { hi: 'Hindi in Devanagari script', bn: 'Bengali', hinglish: 'Roman-script Hinglish', en: 'English' }[language] || 'English';
  return `Continue in ${label}, including the next question. Short dates, numbers, place names and yes/no answers do not change the conversation language. Aura is a feminine speaker: use feminine first-person Hindi/Hinglish forms ("मैं मदद कर सकती हूँ", "मैं देख रही हूँ", "main madad kar sakti hoon", "main dekh rahi hoon"). Do not infer or change the customer's gender. English remains natural and gender-neutral.`;
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

export function localizeAuraQuestion(question, language, event = null) {
  if (!question || !['hi', 'hinglish'].includes(language)) return question ? { ...question, language } : null;
  const hi = language === 'hi', index = hi ? 0 : 1, topic = question.topic;
  const eventQuestions = {
    'event.type': ['किस तरह का इवेंट प्लान करना है?', 'Kis tarah ka event plan karna hai?'],
    'event.date': ['आपका इवेंट किस तारीख को है?', 'Aapka event kis tareekh ko hai?'],
    'event.city': ['इवेंट किस शहर में होगा?', 'Event kis shehar mein hoga?'],
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
