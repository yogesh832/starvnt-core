/** A venue candidate is not an arranged service. Prefer a follow-up to guessing. */
export function explicitVenueArrangement(message, { askedTopic, venueName } = {}) {
  const text = String(message || '').toLowerCase();
  if (/[?？]/.test(text)) return false;
  const negative = /\b(not|haven't|havent|haven’t|isn't|isn’t|isnt|yet|nahi|nahin|will|want|need|might|considering|shortlisted)\b|नहीं|नही/;
  const arranged = /\b(booked|already arranged|already have|have arranged|booking confirmed|arranged hai|book kar liya|book kar li|book ho gaya)\b|बुक कर लिया|बुक हो गया/;
  return text.split(/[.;,]|\b(?:but|and|lekin|aur)\b/).some(clause => {
    const venue = /\b(venue|hall|banquet|ghar|home)\b/.test(clause) || (venueName && clause.includes(String(venueName).toLowerCase()));
    const affirmativeReply = askedTopic === 'requirement.venue' && /^\s*(yes|haan|han|already arranged)\b/.test(clause);
    return !negative.test(clause) && ((venue && arranged.test(clause)) || affirmativeReply);
  });
}
