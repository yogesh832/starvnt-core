const TEAM_QUESTION = /team size|how many.{0,24}(?:people|members|crew|staff)|(?:team|crew).{0,20}kitne|टीम.{0,24}(?:कितने|कितनी|संख्या)|কতজন/i;
const EQUIPMENT_QUESTION = /(?:what|which).{0,24}(?:equipment|gear|cameras?)|(?:equipment|gear).{0,24}(?:kaun|kya|details)|उपकरण.{0,26}(?:कौन|जानकारी|बताइ)|कौन.{0,18}उपकरण|সরঞ্জাম.{0,18}(?:কী|বলুন)|কী.{0,10}সরঞ্জাম/i;
const SERVICE_QUESTION = /which active service should i use|(?:which|what) service (?:should|do)|the active service name|किस सक्रिय सर्विस में जोड़ूँ|kis active service mein jodun|কোন সক্রিয় পরিষেবায় যোগ করব/i;
const CHOICE_CONTEXT = /\b(?:not|except|instead of|rather than|nahi|nahin|or|ya|either)\b|नहीं|नही|छोड़कर|ছাড়া|(?:^|\s)या(?:\s|$)/i;
const SERVICE_FILLER = new Set(['please', 'one', 'the', 'this', 'that', 'for', 'with', 'use', 'select', 'choose', 'service', 'package', 'wali', 'wala', 'वाली', 'वाला', 'वाले']);
const EQUIPMENT = /\b(?:cameras?|lenses?|drones?|gimbals?|tripods?|lights?|strobes?|microphones?|speakers?|sony|canon|nikon|fujifilm|lumix|blackmagic|dji|godox)\b|कैमर|लेंस|ड्रोन|ट्राइपॉड|माइक|लाइट|ক্যামেরা|লেন্স|ড্রোন/i;

function digits(value) {
  return String(value || '').replace(/[०-९০-৯]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x09e6 ? 0x09e6 : 0x0966));
  });
}

function teamNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 500 ? number : null;
}

export function explicitTeamSize(text) {
  const normalized = digits(text);
  const matches = [
    ...normalized.matchAll(/(?:\b(?:team\s+size|team\s+(?:of|is|has|me(?:in)?)|crew\s+size)\b\s*(?:is\s*)?|टीम\s+में\s*|দলে\s*)(?:[:=]\s*)?(\d{1,3})(?!\d|[.,]\d)/gi),
    ...normalized.matchAll(/(?:^|[^\d.,])(\d{1,3})\s*(?:-\s*)?(?:team\s+members?\b|members?\b|crew\b|staff\b|people\b|photographers?\b|log(?:on)?\b|लोग|सदस्य|জন)/gi),
  ].sort((a, b) => a.index - b.index);
  return teamNumber(matches.at(-1)?.[1]);
}

function shortTeamAnswer(text) {
  const match = /^(\d{1,3})(?:\s+(?:i\s+(?:already\s+)?(?:said|told)\b.*|मैंने\s+पहले\s+ही\s+बता\s+दिया.*|maine\s+pehle\s+hi\s+bata\s+diya.*))?[.!।\s]*$/i.exec(digits(text).trim());
  return teamNumber(match?.[1]);
}

function equipmentAnswer(text) {
  if (/[?？]\s*$/.test(text) || /\b(?:don't|do not)\s+(?:have|use)\b|नहीं\s+(?:है|हैं)/i.test(text)) return [];
  return String(text || '').split(/[,;।]|[.!?](?:\s+|$)|\s+(?:and|aur|और|ও)\s+/i)
    .filter(part => EQUIPMENT.test(part) && !/^(?:do you|what|which|can you|क्या|कौन)/i.test(part.trim()))
    .map(part => part.trim()
      .replace(/^(?:(?:i|we)\s+(?:have|use)\s+|(?:मेरे|हमारे)\s+पास\s+|(?:मेरा|मेरे|हमारे)\s+|(?:mere|hamare)\s+paas\s+)/gi, '')
      .replace(/^(?:मेरा|मेरे|हमारे)\s+/, '')
      .replace(/\s+(?:हैं|है|हूँ|hai|hain)\s*$/i, '').trim())
    .filter(part => part.length > 1 && part.length <= 60)
    .slice(0, 12);
}

export function isCapabilityDetail(text) {
  return Boolean(explicitTeamSize(text) || shortTeamAnswer(text) || equipmentAnswer(text).length);
}

function promptType(text) {
  if (!/[?？]|\b(?:please tell|please share)\b|बताइए|चाहिए|bolun|बताएँ|বলুন/i.test(text)) return null;
  const question = text.split(/(?<=[.!।])\s+|\n/).findLast(part => /[?？]/.test(part)) || text;
  if (SERVICE_QUESTION.test(question)) return 'service';
  if (TEAM_QUESTION.test(question)) return 'team';
  if (EQUIPMENT_QUESTION.test(question)) return 'equipment';
  return null;
}

export function namedCapabilityServices(text, services, { partial = false } = {}) {
  const words = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
  const haystack = ` ${words(text)} `;
  if (partial && CHOICE_CONTEXT.test(text)) return [];
  const matches = field => services.filter(service => {
    const name = words(service[field]);
    return name && haystack.includes(` ${name} `);
  });
  const byName = matches('name');
  if (byName.length) return byName;
  if (partial) {
    const input = new Set(words(text).split(' ').filter(word => word.length > 2 && !SERVICE_FILLER.has(word)));
    const scores = services.map(service => new Set(words(service.name).split(' ').filter(word => input.has(word))).size);
    const best = Math.max(0, ...scores);
    if (best) return services.filter((_, index) => scores[index] === best);
  }
  return matches('category');
}

/** Read vendor-provided facts only from the ongoing team and equipment exchange. */
export function capabilityIntake(history, message, services, pending = null) {
  const last = history.at(-1);
  const currentPrompt = last?.role === 'model' ? promptType(last.content) : null;
  const request = /^complete capacity, resources and coverage for the same active service[.!]?$/i.test(message);
  const askToAdd = /^(?:you\s+add\s+this|(?:please\s+)?(?:add|set\s+up)\s+(?:this|it)|(?:आप|तुम)\s+(?:इसे|ये)\s+जोड़\s+दो)[.!।]?$/i.test(message);
  const currentTeam = explicitTeamSize(message) || (currentPrompt === 'team' || pending ? shortTeamAnswer(message) : null);
  const currentEquipment = equipmentAnswer(message);
  if (!request && ((!currentPrompt && !pending) ||
    (!currentTeam && !currentEquipment.length && !askToAdd && currentPrompt !== 'service'))) return null;

  let teamSize = pending?.capability?.teamSize ?? null;
  let equipment = pending?.capability?.equipment ?? [];
  let named = pending ? services.filter(service => service.id === pending.capability.serviceId) : [];
  const turns = [];
  for (let index = history.length - 1; index >= 0; index -= 2) {
    const prompt = history[index];
    const type = prompt?.role === 'model' && promptType(prompt.content);
    if (!type) break;
    const answer = index === history.length - 1 ? message : history[index + 1]?.content;
    if (answer) turns.unshift({ type, answer });
  }
  if (!turns.length) turns.push({ type: pending ? 'team' : currentPrompt, answer: message });
  for (const { type, answer } of turns) {
    const matches = namedCapabilityServices(answer, services, { partial: type === 'service' });
    if (named.length === 1 && matches.length === 1 && named[0].id !== matches[0].id) {
      teamSize = null;
      equipment = [];
    }
    if (type === 'service' || matches.length) named = matches;
    teamSize = explicitTeamSize(answer) || (type === 'team' ? shortTeamAnswer(answer) : null) || teamSize;
    const listed = type === 'service' ? [] : equipmentAnswer(answer);
    if (listed.length) equipment = listed;
  }
  return {
    teamSize,
    equipment,
    service: named.length === 1 ? named[0] : services.length === 1 ? services[0] : null,
    needsServiceInterpretation: currentPrompt === 'service' && named.length === 0 && services.length > 1 &&
      !/^(?:both|all|any|either|दोनों|कोई भी|सब)[.!।\s]*$/i.test(message.trim()),
    answeringService: currentPrompt === 'service',
  };
}
