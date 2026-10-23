/** Platform-neutral catalogue: no database, Node-only or native dependencies. */
export const VENDOR_CATEGORIES = [
  { value: 'Cinematic Production', key: 'Cinematic_Production', planKey: 'cinematic_production', aliases: ['cinematography', 'wedding films', 'cinematic films'] },
  { value: 'Photography', key: 'Photography', planKey: 'photography', aliases: ['photographer', 'photographers', 'photos', 'फोटोग्राफर'] },
  { value: 'Videography', key: 'Videography', planKey: 'videography', aliases: ['videographer', 'videographers', 'video production'] },
  { value: 'Decor & Styling', key: 'Decoration', planKey: 'decor', aliases: ['decorator', 'decoration', 'decor', 'sajawat', 'डेकोरेशन'] },
  { value: 'Catering', key: 'Catering', planKey: 'catering', aliases: ['caterer', 'caterers', 'food', 'khana', 'कैटरिंग'] },
  { value: 'Makeup & Styling', key: 'Makeup', planKey: 'makeup', aliases: ['makeup artist', 'makeup', 'hair styling', 'beautician', 'मेकअप'] },
  { value: 'DJ & Music', key: 'DJ', planKey: 'dj', aliases: ['dj', 'disc jockey', 'डीजे'] },
  { value: 'Sound & Audio', key: 'Sound', planKey: 'sound', aliases: ['sound vendor', 'sound', 'audio', 'sound system', 'speakers', 'साउंड'] },
  { value: 'Venue', key: 'Venue', planKey: 'venue', aliases: ['banquet', 'hall', 'lawn', 'event venue'] },
  { value: 'Event Planning', key: 'Event_Planning', planKey: 'event_planning', aliases: ['event planner', 'wedding planner', 'planner'] },
  { value: 'Event Coordination', key: 'Event_Coordination', planKey: 'event_coordination', aliases: ['event coordinator', 'day of coordinator', 'coordination'] },
  { value: 'Accommodation & Hotels', key: 'Hotel', planKey: 'accommodation', aliases: ['accommodation', 'hotel', 'hotels', 'guest rooms', 'stay'] },
  { value: 'Hospitality & Guest Management', key: 'Hospitality', planKey: 'hospitality', aliases: ['hospitality', 'guest management', 'guest reception'] },
  { value: 'Transport & Travel', key: 'Transport', planKey: 'transport', aliases: ['transport', 'travel', 'shuttle', 'cab', 'bus', 'fleet'] },
  { value: 'Religious & Spiritual Services', key: 'Religious_Services', planKey: 'ceremony', aliases: ['religious services', 'ceremony', 'pandit', 'purohit', 'priest', 'imam', 'nikah', 'pastor', 'granthi', 'monk', 'jain priest', 'interfaith officiant', 'pujari'] },
  { value: 'Corporate & Conference Production', key: 'Corporate_Production', planKey: 'corporate_production', aliases: ['corporate production', 'conference production', 'mice', 'exhibition', 'audio visual'] },
  { value: 'Anchor & Host', key: 'Anchor_Host', planKey: 'anchor', aliases: ['anchor', 'host', 'emcee', 'mc'] },
  { value: 'Bridal Wear & Costume Rental', key: 'Bridal_Wear', planKey: 'bridal_wear', aliases: ['bridal wear', 'costume rental', 'lehenga rental', 'sherwani rental'] },
  { value: 'Invitations & Stationery', key: 'Invitation', planKey: 'invitation', aliases: ['invitations', 'invitation', 'stationery', 'wedding cards', 'invites'] },
  { value: 'Cakes & Bakery', key: 'Cake', planKey: 'cake', aliases: ['cake', 'cakes', 'bakery', 'baker'] },
  { value: 'Live Music & Bands', key: 'Live_Music', planKey: 'live_music', aliases: ['live music', 'live band', 'band', 'musicians', 'singer'] },
  { value: 'Dance & Choreography', key: 'Choreography', planKey: 'choreography', aliases: ['dance', 'choreography', 'choreographer', 'dancers', 'sangeet choreography'] },
  { value: 'Entertainment & Performers', key: 'Entertainment', planKey: 'entertainment', aliases: ['entertainment', 'performers', 'magician', 'magic show', 'artists'] },
  { value: 'Photo Booth', key: 'Photo_Booth', planKey: 'photo_booth', aliases: ['photobooth', 'photo booth', '360 booth'] },
  { value: 'Special Effects & Pyrotechnics', key: 'Special_Effects', planKey: 'special_effects', aliases: ['special effects', 'pyrotechnics', 'cold pyro', 'fireworks'] },
  { value: 'Live Streaming', key: 'Live_Streaming', planKey: 'live_streaming', aliases: ['live streaming', 'livestream', 'live stream', 'webcast'] },
  { value: 'Lighting & LED', key: 'Lighting', planKey: 'lighting', aliases: ['lighting', 'led lighting', 'led walls', 'event lights'] },
  { value: 'Tent & Marquee', key: 'Tent', planKey: 'tent', aliases: ['tent', 'marquee', 'pandal', 'shamiana'] },
  { value: 'Furniture & Equipment Rental', key: 'Equipment_Rental', planKey: 'equipment_rental', aliases: ['furniture rental', 'equipment rental', 'chair rental', 'table rental'] },
  { value: 'Floristry', key: 'Floristry', planKey: 'floristry', aliases: ['florist', 'floristry', 'flowers', 'floral arrangements'] },
  { value: 'Mehendi Artists', key: 'Mehendi', planKey: 'mehendi', aliases: ['mehendi', 'mehndi', 'henna'] },
  { value: 'Security & Crowd Management', key: 'Security', planKey: 'security', aliases: ['security', 'crowd management', 'bouncers', 'guards'] },
  { value: 'Event Staffing', key: 'Event_Staffing', planKey: 'event_staffing', aliases: ['event staffing', 'event staff', 'ushers', 'hostesses', 'wait staff'] },
  { value: 'Event Cleaning', key: 'Cleaning', planKey: 'cleaning', aliases: ['event cleaning', 'cleaning', 'housekeeping', 'waste management'] },
  { value: 'Valet & Parking', key: 'Valet', planKey: 'valet', aliases: ['valet', 'parking', 'parking attendants'] },
  { value: 'Power & Generators', key: 'Power', planKey: 'power', aliases: ['power', 'generators', 'generator', 'power backup'] },
  { value: 'Gifting & Hamper Services', key: 'Gifting', planKey: 'gifting', aliases: ['gifting', 'hampers', 'gift packing', 'return gifts'] },
  { value: 'Other', key: 'Other', planKey: 'other_service', aliases: ['other service', 'something else'] },
];

const normal = value => String(value || '').normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[_/–-]+/g, ' ').replace(/\s+/g, ' ').trim();
export const VENDOR_CATEGORY_VALUES = VENDOR_CATEGORIES.map(category => category.value);
export function findVendorCategory(value) {
  const query = normal(value);
  if (/^other\s*:/i.test(String(value || ''))) return VENDOR_CATEGORIES.find(category => category.key === 'Other');
  return VENDOR_CATEGORIES.find(category => [category.value, category.key, ...category.aliases].some(alias => normal(alias) === query)) || null;
}
export function searchVendorCategories(query) {
  const words = normal(query).split(' ').filter(Boolean);
  return VENDOR_CATEGORIES.filter(category => {
    const text = normal([category.value, ...category.aliases].join(' '));
    return words.every(word => text.includes(word));
  });
}

// Persist an explicitly supplied unlisted service without losing its description.
export function customVendorServiceInput(value) {
  const match = String(value || '').match(/^other\s*: ?(.*)$/i);
  return match ? match[1] : '';
}
export function customVendorService(value) {
  return customVendorServiceInput(value).trim();
}
export function vendorCategoryError(value) {
  if (/^other(?:\s*:.*)?$/i.test(String(value || '').trim()) && !customVendorService(value)) return 'Please enter the service you provide under Other.';
  if (String(value || '').length > 160) return 'Keep your service name within 150 characters.';
  return null;
}
