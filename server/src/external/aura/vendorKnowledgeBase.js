/**
 * Product help for Vendor OS. These are navigation and workflow explanations,
 * not vendor-specific facts or commercial promises. Keep this catalogue aligned
 * with the shipped pages when a workflow changes. No model is called here.
 *
 * A question matches only an explicit topic and an explicit task phrase. This
 * deliberately favours a clarification over a plausible but wrong answer.
 */
const guides = [
  ['dashboard', 'overview|dashboard|home', 'overview|show|find|see|open', 'The Dashboard is the starting point for your vendor workspace. It brings your setup progress and current business activity together. Open the relevant card for the full record.', '/vendor/dashboard'],
  ['dashboard-setup', 'dashboard|home', 'setup|complete|progress|checklist', 'Your onboarding checklist on the Dashboard shows which setup steps are complete. Open an incomplete step to finish it; a completed checklist does not itself mean verification has been approved.', '/vendor/dashboard'],
  ['dashboard-alerts', 'dashboard|home', 'alert|notification|attention', 'Use the Dashboard cards to spot items needing attention, then open the underlying page before acting. The saved record on that page is the source of truth.', '/vendor/dashboard'],
  ['dashboard-mobile', 'dashboard|home', 'mobile|phone|small screen', 'The vendor workspace works on mobile. Use the navigation menu to reach the same pages when the side navigation is collapsed.', '/vendor/dashboard'],

  ['profile-brand', 'profile|brand|business name', 'name|edit|change|update|where|how', 'Open Profile to review your business name and public brand details. Save changes there and check the updated profile before sharing it.', '/vendor/profile'],
  ['profile-contact', 'profile|contact|phone|website', 'edit|change|update|where|how|add', 'Open Profile for your business contact details. Keep the phone number and website current so customers can identify the right business.', '/vendor/profile'],
  ['profile-category', 'profile|category', 'change|choose|edit|where|how', 'Your service category belongs with your business profile. Review it on Profile and make sure it represents the services you actually offer.', '/vendor/profile'],
  ['profile-public', 'profile|public listing|listing', 'view|preview|find|where', 'Review your saved Profile and Portfolio content before sharing a public listing. Published information should reflect your real business and services.', '/vendor/profile'],

  ['services-add', 'service|package|offering', 'add|create|list|where|how', 'Open Services to add the offerings you provide. Enter the service details and price there, then review the saved service before using it in a quote.', '/vendor/services'],
  ['services-edit', 'service|package|offering', 'edit|change|update|remove', 'Open Services and select the existing offering to review its details. Changes to an offering should be checked against any quotes already sent.', '/vendor/services'],
  ['services-price', 'service|package|offering', 'base price|starting price|price field|display price', 'Keep your actual service price in Services. A displayed starting price is a business input, not an automatically approved customer quote.', '/vendor/services'],
  ['services-gear', 'equipment|gear|team|crew', 'record|enter|where|how|add', 'Use Services to describe the team and equipment attached to an offering. Accurate capacity helps you assess enquiries before accepting work.', '/vendor/services'],

  ['coverage-area', 'coverage|service area|city|radius', 'set|edit|where|how|add', 'Set the areas you serve in your location or coverage settings. Coverage tells the platform where you are willing to work; it is separate from your physical operating location.', '/vendor/profile'],
  ['location-pin', 'location|address|map|pin', 'set|edit|where|how|add', 'Add your physical operating location from Profile using the location controls. Check the map pin and address before saving; a coverage radius alone does not provide an operating location.', '/vendor/profile'],
  ['location-multiple', 'location|address|branch', 'multiple|second|additional', 'Review your saved operating locations on Profile. Add another only when it represents a real business location you operate from.', '/vendor/profile'],
  ['location-travel', 'coverage|service area|travel', 'distance|radius|outside|area', 'Your coverage describes where you can take work. For an enquiry outside your usual area, review the event location and your travel capacity before quoting.', '/vendor/profile'],

  ['portfolio-add', 'portfolio|gallery|photo|video', 'upload|add|where|how', 'Open Portfolio to upload work samples. Use media you have permission to display and describe the actual event or service shown.', '/vendor/portfolio'],
  ['portfolio-edit', 'portfolio|gallery|photo|video', 'edit|change|remove|delete', 'Manage existing media in Portfolio. Review captions and visibility after editing so a customer sees the correct work.', '/vendor/portfolio'],
  ['portfolio-quality', 'portfolio|gallery|photo|video', 'quality|best practice|organize', 'Choose clear, representative images of your own work. A concise caption and the relevant service make each sample easier to understand.', '/vendor/portfolio'],
  ['portfolio-consent', 'portfolio|gallery|photo|video', 'permission|consent|customer image', 'Before publishing customer or guest images, make sure you have permission to use them. Remove media that you cannot legitimately display.', '/vendor/portfolio'],

  ['availability-calendar', 'availability|calendar', 'open|where|how|view|find', 'Open Availability or Calendar to review dated availability. Check existing bookings and blockouts before you promise a date to a customer.', '/vendor/availability'],
  ['availability-block', 'availability|calendar|date', 'block|holiday|unavailable|close date', 'Use Availability to block a date when you cannot take work. Review the saved blockout and any existing booking before treating the date as unavailable.', '/vendor/availability'],
  ['availability-edit', 'availability|calendar|blockout', 'edit|change|remove|unblock', 'Open Availability to review and change a saved blockout. Recheck the calendar after the change.', '/vendor/availability'],
  ['availability-hours', 'availability|hours|weekday|sunday', 'working hours|office hours|event date|closed', 'Business or office hours describe normal contact hours. Event-date availability depends on dated blockouts, bookings, timing and capacity; a closed office day alone does not rule out an event.', '/vendor/availability'],

  ['enquiries-inbox', 'enquiry|enquiries|lead|inquiry', 'where|find|open|view|see', 'Open Enquiries for incoming opportunities. Read the event brief, location, date and requested service before responding.', '/vendor/enquiries'],
  ['enquiries-reply', 'enquiry|enquiries|lead|inquiry', 'reply|respond|message|contact', 'Open the enquiry record to respond. Keep the answer tied to the customer brief and confirm your availability before offering a commitment.', '/vendor/enquiries'],
  ['enquiries-brief', 'enquiry|enquiries|lead|inquiry', 'brief|details|information', 'The enquiry record contains the details the customer supplied. If a required detail is missing, ask the customer in that enquiry rather than guessing.', '/vendor/enquiries'],
  ['enquiries-status', 'enquiry|enquiries|lead|inquiry', 'status|pipeline|track', 'Track each opportunity from its Enquiries record. A new enquiry is not a confirmed booking; review the latest saved status before planning work.', '/vendor/enquiries'],

  ['quotes-create', 'quote|quotation|estimate|proposal', 'create|draft|where|how', 'Use Quotes to prepare a quotation from the agreed scope. Review services, quantities, dates and totals before sending it to the customer.', '/vendor/quotes'],
  ['quotes-edit', 'quote|quotation|estimate|proposal', 'edit|revise|change|update', 'Open the quote record to review a revision. Make the changed scope and total clear before sending the revised offer.', '/vendor/quotes'],
  ['quotes-status', 'quote|quotation|estimate|proposal', 'status|track|sent|accepted|expired', 'Open Quotes to see the latest recorded state of an offer. A sent quote is not itself an accepted booking.', '/vendor/quotes'],
  ['quotes-total', 'quote|quotation|estimate|proposal', 'total|line item|breakdown|tax', 'Review the line items and total in the quote before sending. Use the saved quote and applicable transaction terms for the actual customer price; do not rely on a generic estimate.', '/vendor/quotes'],

  ['bookings-list', 'booking|event|job', 'where|find|open|view|see', 'Open Bookings to review confirmed work. Check each record for the event date, scope and current execution status.', '/vendor/bookings'],
  ['bookings-start', 'booking|event|job', 'start|begin|execution', 'Open the booking before starting work. Use its execution controls and the confirmed scope; do not treat an enquiry or quote as a booking.', '/vendor/bookings'],
  ['bookings-proof', 'booking|event|job|deliverable', 'proof|evidence|completion|submit', 'Use the booking record to submit completion evidence or deliverables when the work is done. Submission and verification are distinct steps.', '/vendor/bookings'],
  ['bookings-dispute', 'booking|event|job|dispute', 'status|where|view', 'The booking record shows the saved execution and dispute status. For a disputed item, review the evidence and the current record before taking another step.', '/vendor/bookings'],

  ['payments-list', 'payment|payout|settlement|earning', 'where|open|view|find|see', 'Open Payments to review recorded payment and settlement statuses. The page shows saved records; a provider verification does not by itself prove a bank transfer.', '/vendor/payments'],
  ['payments-pending', 'payment|payout|settlement|earning', 'pending|hold|eligible|status', 'Check the specific booking and Payments records for the current settlement state. Completion submission, review, eligibility and transfer are separate stages.', '/vendor/payments'],
  ['payments-receipt', 'payment|payout|settlement|earning', 'receipt|proof|transaction|reference', 'Use the transaction record on Payments for available references and recorded status. If a transfer is not shown as completed, do not describe it as paid.', '/vendor/payments'],
  ['payments-policy', 'payment|payout|settlement|earning', 'policy|process|how it works', 'A booking may need completion evidence and review before becoming settlement eligible. Always use the current booking and payment records for a particular case.', '/vendor/payments'],

  ['reviews-list', 'review|rating|feedback', 'where|find|open|view|see', 'Open Reviews to see feedback recorded for your business. Check whether a review is from STARVNT or a connected external source before quoting it.', '/vendor/reviews'],
  ['reviews-reply', 'review|rating|feedback', 'reply|respond|answer', 'Open the individual review to reply. A useful response addresses the customer’s actual feedback and avoids sharing private booking details.', '/vendor/reviews'],
  ['reviews-external', 'review|rating|feedback|google', 'google|external|source|difference', 'A connected Google Business rating and on-platform STARVNT reviews are different sources. Check each source and its review count separately.', '/vendor/reviews'],
  ['reviews-rating', 'review|rating|feedback', 'score|stars|average|count', 'Review the displayed rating and review count on Reviews. If the source has no rating, do not present one as zero stars.', '/vendor/reviews'],

  ['documents-upload', 'document|kyc|pan|gst|bank proof', 'upload|add|where|how', 'Open Documents for the business verification files requested by the platform. Upload clear, accurate records for your own business.', '/vendor/documents'],
  ['documents-status', 'document|kyc|verification', 'status|pending|approved|rejected', 'Check the individual document and verification status in Documents. Uploading a file does not mean the review is complete.', '/vendor/documents'],
  ['documents-replace', 'document|kyc|file', 'replace|change|correct|update', 'Use Documents to review a file that needs correction. Check the new file and its review state after replacing it.', '/vendor/documents'],
  ['documents-privacy', 'document|kyc|bank proof', 'safety|privacy|share', 'Use the authenticated Documents page for verification files. Do not paste sensitive document numbers or bank credentials into chat.', '/vendor/documents'],

  ['readiness-open', 'readiness|activation|matching', 'where|open|view|check', 'Open Business Readiness to see the current activation checks. Complete missing setup items and review verification status there.', '/vendor/readiness'],
  ['readiness-meaning', 'readiness|activation|matching', 'eligible|verified|meaning|difference', 'Setup completion, document verification and matching eligibility are separate checks. Use Business Readiness for the current result rather than assuming one status implies another.', '/vendor/readiness'],
  ['readiness-fix', 'readiness|activation|matching', 'missing|incomplete|fix', 'Follow the incomplete items shown in Business Readiness. Each item links to the page where its underlying data can be corrected.', '/vendor/readiness'],
  ['readiness-public', 'readiness|activation|matching', 'public|visible|listed', 'A complete profile helps customers understand your business, but listing and matching depend on the current verification and eligibility checks shown in Business Readiness.', '/vendor/readiness'],

  ['messages-inbox', 'message|conversation|chat|inbox', 'where|open|view|find', 'Open Messages for customer conversations associated with your vendor workspace. Use the relevant conversation to keep the event context together.', '/vendor/messages'],
  ['messages-privacy', 'message|conversation|chat|inbox', 'private|safe|share', 'Keep customer conversations in the relevant workspace thread. Avoid posting credentials, banking secrets or unrelated personal details.', '/vendor/messages'],
  ['updates-open', 'update|notification|announcement', 'where|open|view|find', 'Open Updates for product or workspace notices. Check the date and detail of an update before relying on it.', '/vendor/updates'],
  ['analytics-open', 'analytics|report|insight', 'where|open|view|find', 'Open Analytics for recorded business metrics. Use the underlying enquiry, quote, booking and payment records to investigate a specific figure.', '/vendor/analytics'],
  ['analytics-meaning', 'analytics|report|insight', 'conversion|trend|metric|number', 'Analytics summarizes recorded activity; it does not guarantee future leads or revenue. Verify the time period and the source records when comparing numbers.', '/vendor/analytics'],
  ['settings-open', 'setting|preferences|account', 'where|open|view|change', 'Open Settings for available workspace and account preferences. Save a change and check it took effect before closing the page.', '/vendor/settings'],
];

const stop = new Set(['a','an','and','are','can','could','do','does','for','from','get','i','in','is','it','me','my','of','on','our','please','show','tell','the','to','us','we','what','where','which','with','you']);
const stem = word => word.endsWith('ies') && word.length > 5 ? `${word.slice(0, -3)}y` : word.endsWith('s') && !word.endsWith('ss') && word.length > 4 ? word.slice(0, -1) : word;
const words = text => String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => !stop.has(word)).map(stem) || [];
const taskPattern = /\b(how|where|what|why|which|can|show|find|open|view|see|edit|change|update|add|create|upload|remove|delete|track|check|list|explain|tell|manage|set|reply|respond|submit|block)\b/i;
const escalationPattern = /\b(review (my|this|the)|explain (this|my|our)|analyse|analyze|recommend|suggest|compare|draft|write|calculate|estimate|decide|what should i|what do i do next|next step|complete capacity|resources and coverage|you add|do it|for me|on my behalf|help me (complete|set|add|update|change|create)|set up my|send (it|this|a)|save (it|this)|approve|accept|reject|refund|dispute|my work|work status|work today|kaam|agla|sam[iy]ksha)\b/i;

export const VENDOR_KNOWLEDGE_COUNT = guides.length;

/** Action, review and next-step requests go to Aura; ordinary help stays local. */
export function shouldHandoffToAura(message) {
  const text = String(message || '').trim();
  return escalationPattern.test(text)
    || /^(?:please\s+)?(?:add|create|update|change|remove|delete|block|send|save|set)\b/i.test(text)
    || /\b(?:my|our)\b.{0,60}\b(?:status|amount|balance|rating|record|booking|quote|enquiry|payment|settlement)\b/i.test(text) && /\b(?:check|review|status|amount|balance|rating|record|tell|explain|what|why)\b/i.test(text);
}

export function vendorKnowledgeAnswer(message) {
  const query = String(message || '').trim().toLowerCase();
  if (!query || shouldHandoffToAura(query)) return null;
  if (!taskPattern.test(query)) return null;
  let best = null;
  let bestScore = 0;
  let tied = false;
  const queryWords = new Set(words(query));
  for (const [id, subject, task, reply, to] of guides) {
    const subjects = subject.split('|');
    const tasks = task.split('|');
    const matchedSubject = subjects.filter(s => s.includes(' ') ? query.includes(s) : queryWords.has(stem(s)));
    const matchedTask = tasks.filter(s => s.includes(' ') ? query.includes(s) : queryWords.has(stem(s)));
    if (!matchedSubject.length || !matchedTask.length) continue;
    const score = Math.max(...matchedSubject.map(s => s.split(' ').length * 3)) + Math.max(...matchedTask.map(s => s.split(' ').length * 2));
    if (score > bestScore) { best = { id, reply, actions: [{ label: `Open ${to.split('/').at(-1)}`, to }], source: 'knowledge_base' }; bestScore = score; tied = false; }
    else if (score === bestScore && best?.actions[0].to !== to) tied = true;
  }
  return tied ? null : best;
}
