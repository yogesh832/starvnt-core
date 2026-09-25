import { DemoListing } from '../models/index.js';

const NOTE = 'Demo listing for development – not a real vendor';

/** 12 demo packages (Blueprint seed). No availability, ratings or images. */
export const DEMO_LISTINGS = [
  { externalRef: 'pho_01', category: 'photography', vendorName: 'Basic Frames Studio', packageName: 'Standard', costBreakdown: { base: 60000 }, includes: ['1 photographer', 'Full-day coverage', '300 edited photos'] },
  { externalRef: 'pho_02', category: 'photography', vendorName: 'Cinematic Tales', packageName: 'Premium Cinematic', costBreakdown: { base: 56000, travel: 4000, additional: 4000 }, includes: ['2 photographers', 'Cinematic highlight film', 'Drone shots'] },
  { externalRef: 'cat_01', category: 'catering', vendorName: 'Rajwada Caterers', packageName: 'Standard Thali', costBreakdown: { base: 450000 }, includes: ['Veg thali', 'Welcome drinks', 'Service staff'] },
  { externalRef: 'dec_01', category: 'decor', vendorName: 'Royal Decor Co.', packageName: 'Royal Theme', costBreakdown: { base: 300000 }, includes: ['Stage decor', 'Entrance gate', 'Floral arrangements'] },
  { externalRef: 'venue_01', category: 'venue', vendorName: 'Malviya Banquet Hall', packageName: 'Standard Hall', costBreakdown: { base: 150000 }, includes: ['Air-conditioned hall', 'Seating', 'Parking'] },
  { externalRef: 'venue_02', category: 'venue', vendorName: 'Kisan Palace Gardens', packageName: 'Lawn + Hall', costBreakdown: { base: 180000 }, includes: ['Lawn', 'Banquet hall', 'Bridal room'] },
  { externalRef: 'trans_01', category: 'transport', vendorName: 'City Cabs Fleet', packageName: 'Guest Shuttle', costBreakdown: { base: 15000 }, includes: ['2 shuttle vans', 'Full day'] },
  { externalRef: 'ent_01', category: 'entertainment', vendorName: 'DJ Rhythm Squad', packageName: 'Evening DJ Set', costBreakdown: { base: 25000 }, includes: ['DJ', 'Lights', '4 hours'] },
  { externalRef: 'ent_02', category: 'entertainment', vendorName: 'Kids Magic Show Co.', packageName: 'Birthday Magic Show', costBreakdown: { base: 12000 }, includes: ['1-hour show', 'Balloon art'] },
  { externalRef: 'cake_01', category: 'cake', vendorName: 'Sweet Layers Bakery', packageName: '2kg Designer Cake', costBreakdown: { base: 4000 }, includes: ['Custom design', 'Delivery'] },
  { externalRef: 'makeup_01', category: 'makeup', vendorName: 'Glow Bridal Studio', packageName: 'Bridal Makeup', costBreakdown: { base: 20000 }, includes: ['Bridal makeup', 'Hair styling', 'Draping'] },
  { externalRef: 'sound_01', category: 'sound', vendorName: 'Beat Box Audio', packageName: 'Full Event Sound', costBreakdown: { base: 18000 }, includes: ['PA system', '2 wireless mics', 'Technician'] },
].map((l) => {
  const cb = { base: 0, travel: 0, additional: 0, ...l.costBreakdown };
  return { ...l, costBreakdown: cb, price: cb.base + cb.travel + cb.additional, description: NOTE, isDemo: true, isActive: true };
});

/** Insert missing demo listings only (never overwrites, never deletes). */
export async function seedDemoListings() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo listings when NODE_ENV=production');
  }
  const res = await DemoListing.bulkWrite(
    DEMO_LISTINGS.map((l) => ({
      updateOne: { filter: { externalRef: l.externalRef }, update: { $setOnInsert: l }, upsert: true },
    })),
    { ordered: false }
  );
  return { inserted: res.upsertedCount, total: DEMO_LISTINGS.length };
}
