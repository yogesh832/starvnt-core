const PAGE_PROMPTS = {
  dashboard: ['What should I do today?', 'Which enquiries still need a reply?', 'When is my next booking?'],
  enquiries: ['Which enquiries still need a reply?', 'Show my new enquiries', 'Which enquiries need a quote?'],
  quotes: ['Which quotes are pending?', 'How many draft quotes do I have?', 'Which quotes are expiring soon?'],
  bookings: ['When is my next booking?', "Show this week's bookings", 'Which bookings need a work update?'],
  calendar: ['Which days are busy in the next 2 weeks?', 'When is my next booking?', 'Which dates are blocked?'],
  availability: ['Which dates are blocked?', 'Help me block a date', 'Show upcoming bookings before I block a date'],
  payments: ['Mera settlement status kya hai?', 'Show my settled payouts and pending balance', 'How does settlement work?'],
  reviews: ['Which reviews still need a reply?', 'Summarise my customer reviews', "What's my current rating?"],
  services: ['Summarise my services', 'Help me add a service with a price', 'Help me update my team and equipment'],
  profile: ["What's missing in my profile?", "What's missing for activation?", 'Help me update my business details'],
  portfolio: ['What should I put in my portfolio?', 'How do I add a portfolio project?', 'What portfolio details are still missing?'],
  documents: ["What's pending in my KYC?", 'Which documents still need verification?', 'What documents do I need for activation?'],
  analytics: ['Summarise my business activity', 'How are my enquiries and bookings doing?', 'What should I focus on next?'],
  messages: ['Which enquiries still need a reply?', 'Show enquiries waiting for a quote', 'When is my next booking?'],
  updates: ['Which customer conversations need a reply?', 'What important updates need my attention?', 'Which enquiries still need a quote?'],
  settings: ['How do I update my business details?', "What's missing for activation?"],
};

const TOPICS = [
  ['quotes', /\b(quote|quotes|quotation|quotations|offer|offers)\b/i],
  ['payments', /\b(payment|payments|advance|paid|payout|payouts|settle|settlement|settlements|balance|receivable|paisa|paise)\b/i],
  ['availability', /\b(block|blocked|unavailable|availability)\b/i],
  ['calendar', /\b(calendar|busy dates)\b/i],
  ['bookings', /\b(booking|bookings|booked)\b/i],
  ['enquiries', /\b(enquiry|enquiries|inquiry|inquiries|lead|leads)\b/i],
  ['reviews', /\b(review|reviews|rating|ratings)\b/i],
  ['documents', /\b(kyc|document|documents|verification)\b/i],
  ['portfolio', /\b(portfolio)\b/i],
  ['services', /\b(service|services|equipment|gear|team|coverage)\b/i],
  ['profile', /\b(profile|setup|brand|business|photography|photographer|catering|decor|makeup)\b/i],
];

/** Suggestions follow the latest topic, current page, and unfinished setup. */
export function getAuraPrompts({ page = 'dashboard', setup, messages = [], pending, sending, steps = [] }) {
  if (pending || sending) return [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const recentText = lastUser && (!lastUser.page || lastUser.page === page) ? lastUser.content : '';
  const topic = TOPICS.find(([, pattern]) => pattern.test(recentText || ''))?.[0];
  const context = topic || page;
  const unfinished = setup?.checklist ? steps.filter((s) => !s.done(setup.checklist)) : [];
  const setupContext = ['dashboard', 'profile'].includes(context);
  const candidates = [
    ...(setupContext ? unfinished.map((s) => s.prompt) : []),
    ...(PAGE_PROMPTS[context] || PAGE_PROMPTS.dashboard),
  ];
  return [...new Set(candidates)].filter((prompt) => prompt !== lastUser?.content).slice(0, 3);
}
