const id = event => String(event._id || event.id || '');
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const SWITCH = /\b(switch|change (?:the |my )?event|go (?:back )?to|back to|open|continue (?:with|planning)|work on|wapas|chalo|kholo|badlo|badal)\b|इवेंट बदल|इवेंट बद|वापस|खोलो|खोलिए|चलो|पर चल|पे चल|पर काम/iu;
const LIST = /\b((?:show|list|see) (?:me )?(?:all |my )?events|switch events?|change events?)\b|मेरे इवेंट|इवेंट दिखा|events? dikhao/iu;
const aliases = { wedding: /\b(wedding|shaadi|shadi)\b|शादी|विवाह/iu, birthday: /\b(birthday|janamdin)\b|जन्मदिन/iu, puja: /\b(puja|pooja)\b|पूजा/iu, anniversary: /\b(anniversary|saalgirah)\b|सालगिरह/iu, corporate: /\b(corporate|office)\b|कॉर्पोरेट/iu };

/** Resolve only explicit navigation or answers to an event picker, using owned events. */
export function resolveEventSwitch(text, events, { currentId, previousId, pendingIds = [], explicitId } = {}) {
  if (explicitId) return { kind: 'switch', event: events.find(event => id(event) === String(explicitId)) || null };
  const pending = pendingIds.length ? events.filter(event => pendingIds.map(String).includes(id(event))).sort((a, b) => pendingIds.map(String).indexOf(id(a)) - pendingIds.map(String).indexOf(id(b))) : [];
  // Editing a fact or opening a venue is not an event-navigation command.
  if (/\b(change|update|edit|badal|badlo)\b|बदल|बदलो/iu.test(text) && /\b(date|budget|guests?|city|venue|time)\b|तारीख|बजट|मेहमान|समय/iu.test(text) && !/\bswitch\b|वापस/iu.test(text)) return null;
  const eventReference = /\bevents?\b|इवेंट|आयोजन/iu.test(text) || Object.values(aliases).some(pattern => pattern.test(text)) || events.some(event => normalized(event.title) && normalized(text).includes(normalized(event.title))) || /\b(previous|back|wapas)\b|पिछल|वापस/iu.test(text);
  const command = LIST.test(text) || (SWITCH.test(text) && eventReference) || /\bevent\s+(?:change|switch|badal)/iu.test(text);
  if (!command && !pending.length) return null;
  const value = normalized(text);
  if (pending.length) {
    if (/^(cancel|never mind|stay here|keep (?:the )?current event|रहने दो|यही इवेंट|rehne do)$/.test(value)) {
      const current = events.find(event => id(event) === String(currentId));
      if (current) return { kind: 'switch', event: current };
    }
    const choice = value.replace(/^(the |number |option )/, '').replace(/ (one|event|वाला|wale|wala)$/, '');
    const ordinalWords = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const hindiOrdinals = { पहला: 0, पहले: 0, pehla: 0, एक: 0, दूसरा: 1, दूसरे: 1, doosra: 1, dusra: 1, दो: 1, तीसरा: 2, teesra: 2, तीन: 2, चौथा: 3, chautha: 3, चार: 3, पाँचवाँ: 4, पाँच: 4 };
    const numeric = choice.match(/^(\d+)(?:st|nd|rd|th)?$/);
    const cardinal = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].indexOf(choice);
    const ordinal = numeric ? Number(numeric[1]) - 1 : hindiOrdinals[choice] ?? (cardinal >= 0 ? cardinal : ordinalWords.indexOf(choice));
    if (ordinal >= 0 && pending[ordinal]) return { kind: 'switch', event: pending[ordinal] };
  }
  if (command && /\b(previous|back|wapas)\b|पिछल|वापस/iu.test(text) && previousId) {
    const previous = events.find(event => id(event) === String(previousId));
    if (previous) return { kind: 'switch', event: previous };
  }
  const candidates = pending.length ? pending : events;
  let matches = candidates.filter(event => {
    const title = normalized(event.title);
    return title && (value.includes(title) || value === title);
  });
  if (!matches.length && pending.length) matches = pending.filter(event => normalized(event.city) === value || normalized(event.eventDate) === value);
  if (!matches.length) {
    const types = Object.entries(aliases).filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
    if (types.length) matches = candidates.filter(event => types.includes(event.eventType));
  }
  if (matches.length > 1) {
    const byCity = matches.filter(event => event.city && value.includes(normalized(event.city)));
    if (byCity.length) matches = byCity;
    const year = text.match(/\b20\d{2}\b/)?.[0];
    if (year) matches = matches.filter(event => String(event.eventDate || '').startsWith(year));
  }
  if (!matches.length && command && /\b(other|another|next)\b|दूसरे इवेंट|दूसरा इवेंट/iu.test(text)) matches = candidates.filter(event => id(event) !== String(currentId));
  if (matches.length === 1) return { kind: 'switch', event: matches[0] };
  if (matches.length > 1) return { kind: 'choose', events: matches };
  if (!command && pending.length) return { kind: 'choose', events: pending, notFound: true };
  if (!command) return null;
  return { kind: 'choose', events, notFound: !LIST.test(text) };
}

export const eventChoices = events => events.map(event => ({ id: id(event), title: event.title || event.eventType || 'Event', city: event.city || '', date: event.eventDate || '', status: event.status }));
export function switchReply(language, event, choices, notFound = false) {
  if (event) return language === 'hi' ? `अब मैं “${event.title}” की प्लानिंग कर रही हूँ। उसका कार्ड नीचे देख लें।` : language === 'hinglish' ? `Ab main “${event.title}” ki planning kar rahi hoon. Uska card neeche dekh lein.` : `We're now planning “${event.title}”. Its details are on the card below.`;
  if (!choices.length) return language === 'hi' ? 'अभी कोई इवेंट नहीं मिला। किस इवेंट की प्लानिंग करनी है?' : language === 'hinglish' ? 'Abhi koi event nahi mila. Kis event ki planning karni hai?' : 'You have no saved events yet. What would you like to plan?';
  return language === 'hi' ? `${notFound ? 'उस नाम का इवेंट नहीं मिला। ' : ''}किस इवेंट पर चलें? नाम बोलें या नीचे देख लें।` : language === 'hinglish' ? `${notFound ? 'Us naam ka event nahi mila. ' : ''}Kis event par chalein? Naam bolein ya neeche dekh lein.` : `${notFound ? "I couldn't find that event. " : ''}Which event would you like to work on? Say its name or check the suggestions below.`;
}
