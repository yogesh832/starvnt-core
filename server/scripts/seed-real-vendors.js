import { connectDB, disconnectDB } from '../src/db/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { TravelPolicy } from '../src/external/models/TravelPolicy.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { Notification } from '../src/external/models/Notification.js';
import { VendorReview } from '../src/external/models/VendorReview.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { hashPassword } from '../src/external/utils/password.js';

export const COMMON_PASSWORD = 'Password123';

export const REAL_VENDORS = [
  {
    owner: {
      fullName: 'Arun Roy',
      email: 'vendor@starvnt.com',
      phone: '+91 98765 43210',
    },
    org: {
      businessName: 'Premium Moments Studio',
      category: 'Photography',
      location: 'Salt Lake, Kolkata, West Bengal',
      phone: '+91 98765 43210',
      website: 'https://premiummoments.starvnt.com',
      bio: 'Award-winning wedding & cinematic film studio capturing timeless love stories across India. Specializing in fine-art portraits, emotional teasers, and drone aerial cinematography.',
      profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 142 },
      googlePlaceId: 'place_kolkata_premium_moments',
    },
    location: {
      label: 'Salt Lake Main Studio',
      type: 'STUDIO',
      address: 'Sector V, Salt Lake',
      locality: 'Salt Lake',
      city: 'Kolkata',
      state: 'West Bengal',
      postalCode: '700091',
      coordinates: { lat: 22.585, lng: 88.435 },
    },
    services: [
      {
        name: 'Wedding Photography & Cinematic Video',
        category: 'Photography',
        pricing: { pricingType: 'FIXED', basePrice: 48000, unit: 'event' },
        deliverables: ['1 High-Res Album (40 pgs)', 'Raw Photos (800+)', '3-min 4K Teaser Film', 'Full 60-min Traditional Video'],
        leadTimeDays: 7,
      },
      {
        name: 'Pre-Wedding & Couple Concept Shoot',
        category: 'Photography',
        pricing: { pricingType: 'FIXED', basePrice: 22000, unit: 'event' },
        deliverables: ['15 Retouched High-Res Images', '1-min Instagram Reel', 'Drone Concept Video', '2 Outfit Changes'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Candid', 'Cinematic', 'Fine Art', 'Aerial Drone', 'Traditional'],
      deliverables: ['High-Res Album', 'Teaser Film', 'Full Event Video', 'Raw Footage'],
      teamSize: 3,
      equipment: ['Sony A7IV', 'Sony FX3', 'DJI Ronin RS3', 'DJI Mini 4 Pro Drone'],
    },
    coverage: {
      city: 'Kolkata',
      localities: ['Salt Lake', 'New Town', 'Rajarhat', 'Park Street', 'Alipore', 'Ballygunge'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Kisan Palace Grand Celebration',
        eventType: 'Wedding',
        style: 'Cinematic',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=300&q=80',
        tags: ['Wedding', 'Varmala', 'Cinematic'],
      },
      {
        title: 'Golden Hour Royal Portrait',
        eventType: 'Pre-wedding',
        style: 'Candid',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=300&q=80',
        tags: ['Outdoor', 'Golden Hour', 'Couple'],
      },
      {
        title: 'Emotional Vidaai Moments',
        eventType: 'Wedding',
        style: 'Fine Art',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=300&q=80',
        tags: ['Emotion', 'B&W', 'Vidaai'],
      },
    ],
    reviews: [
      {
        customerName: 'Ananya & Rohan Sengupta',
        rating: 5,
        reviewText: 'Arun and his team captured our 3-day wedding so gracefully! The teaser film made my entire family cry happy tears. Highly recommend them!',
        wouldRecommend: true,
      },
      {
        customerName: 'Pooja Agarwal',
        rating: 5,
        reviewText: 'Incredible candid timing and very cooperative crew. We received the edited photos within two weeks, stunning quality.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Chef Sanjeev Verma',
      email: 'catering@starvnt.com',
      phone: '+91 98111 23456',
    },
    org: {
      businessName: 'Royal Feast & Banquets Catering',
      category: 'Catering',
      location: 'Connaught Place, Delhi',
      phone: '+91 98111 23456',
      website: 'https://royalfeast.starvnt.com',
      bio: 'Culinary excellence for high-profile weddings and corporate galas. Featuring live artisanal counters, authentic royal Mughlai, Awadhi dum pukht, and Pan-Asian spread.',
      profilePicUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 215 },
      googlePlaceId: 'place_delhi_royal_feast',
    },
    location: {
      label: 'Central Cloud Kitchen & Commissary',
      type: 'KITCHEN',
      address: 'Barakhamba Road, Connaught Place',
      locality: 'Connaught Place',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110001',
      coordinates: { lat: 28.6315, lng: 77.2167 },
    },
    services: [
      {
        name: 'Royal Mughlai & Continental Wedding Buffet',
        category: 'Catering',
        pricing: { pricingType: 'FIXED', basePrice: 1650, unit: 'plate' },
        deliverables: ['8 Welcome Drinks & Mocktails', '12 Live Starters', 'Main Course (18 items)', 'Artisanal Dessert Station', 'Uniformed Butler Staff'],
        leadTimeDays: 14,
      },
      {
        name: 'Live Chaat & Global Street Food Carnival',
        category: 'Catering',
        pricing: { pricingType: 'FIXED', basePrice: 45000, unit: 'event' },
        deliverables: ['Dilli 6 Chandni Chowk Chaat Counter', 'Woodfired Pizza Oven', 'Dim Sum & Bao Bar', 'Liquid Nitrogen Ice Cream'],
        leadTimeDays: 7,
      },
    ],
    capabilities: {
      styles: ['Mughlai', 'Awadhi', 'Pan-Asian', 'Continental', 'Live Counters', 'Pure Vegetarian Available'],
      deliverables: ['Custom Menu Tasting', 'Buffet Styling & Warmers', 'Uniformed Waitstaff', 'Bone China Crockery'],
      teamSize: 24,
      equipment: ['Mobile Commercial Kitchen Vans', 'Chafing Stations', 'Woodfired Pizza Trolley'],
    },
    coverage: {
      city: 'Delhi',
      localities: ['Connaught Place', 'South Extension', 'Aerocity', 'Vasant Kunj', 'Gurgaon', 'Noida'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Awadhi Biryani & Kebab Live Station',
        eventType: 'Wedding',
        style: 'Mughlai',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=300&q=80',
        tags: ['Gourmet', 'Live Counter', 'Buffet'],
      },
      {
        title: 'Artisanal Wedding Dessert Bar',
        eventType: 'Reception',
        style: 'Continental',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=300&q=80',
        tags: ['Desserts', 'Pastry', 'Luxury'],
      },
    ],
    reviews: [
      {
        customerName: 'Vikram & Simran Khurana',
        rating: 5,
        reviewText: 'The food was the absolute talk of our wedding! Guests are still raving about the Galouti kebabs and the dessert station.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Priya Sharma',
      email: 'decor@starvnt.com',
      phone: '+91 98222 34567',
    },
    org: {
      businessName: 'Flora & Grandeur Event Decor',
      category: 'Decoration',
      location: 'Aerocity, Delhi',
      phone: '+91 98222 34567',
      website: 'https://floragrandeur.starvnt.com',
      bio: 'Creating majestic visual experiences through bespoke floral installations, fairytale mandaps, ambient fairy-light canopies, and luxury stage sets.',
      profilePicUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 188 },
      googlePlaceId: 'place_delhi_flora_grandeur',
    },
    location: {
      label: 'Aerocity Design Studio & Warehouse',
      type: 'STUDIO',
      address: 'Hospitality District, Aerocity',
      locality: 'Aerocity',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110037',
      coordinates: { lat: 28.5505, lng: 77.1212 },
    },
    services: [
      {
        name: 'Grand Floral Mandap & Luxury Stage Concept',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 175000, unit: 'event' },
        deliverables: ['Imported Dutch Florals Mandap', 'Royal Stage Backdrop with Chandeliers', 'Entry Tunnel Decor (60 ft)', 'Varmala Setup with CO2 jets'],
        leadTimeDays: 10,
      },
      {
        name: 'Ambient Fairy Light & Reception Canopy',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 85000, unit: 'event' },
        deliverables: ['10,000 Warm White Fairy Lights Canopy', 'Vintage Edison Bulb Clusters', 'Lounge Seating with Velvet Cushions', 'Photo Booth Mirror Wall'],
        leadTimeDays: 7,
      },
    ],
    capabilities: {
      styles: ['Royal Regal', 'Pastel Boho', 'Contemporary Luxe', 'Traditional Floral', 'Minimalist Elegance'],
      deliverables: ['3D Venue Renders', 'Fresh Florals Sourcing', 'Custom Furniture & Drapes', 'Mood Lighting Coordination'],
      teamSize: 18,
      equipment: ['Truss Systems', 'Fairy Light Curtains', 'Crystal Chandeliers', 'Custom Brass Props'],
    },
    coverage: {
      city: 'Delhi',
      localities: ['Aerocity', 'Gurgaon', 'Chattarpur', 'Vasant Kunj', 'Faridabad', 'Central Delhi'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Pastel Rose Glasshouse Mandap',
        eventType: 'Wedding',
        style: 'Contemporary Luxe',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=300&q=80',
        tags: ['Mandap', 'Florals', 'Luxury'],
      },
      {
        title: 'Starry Night Fairy Light Canopy',
        eventType: 'Sangeet',
        style: 'Minimalist Elegance',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=300&q=80',
        tags: ['Canopy', 'Lights', 'Sangeet'],
      },
    ],
    reviews: [
      {
        customerName: 'Meera & Siddharth Joshi',
        rating: 5,
        reviewText: 'Priya transformed an ordinary lawn into a dreamland. The mandap was breathtaking in all our photos. Super professional team.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Raghav Singhania',
      email: 'venue@starvnt.com',
      phone: '+91 98333 45678',
    },
    org: {
      businessName: 'The Grand Heritage Palace & Lawns',
      category: 'Venue',
      location: 'New Town, Kolkata, West Bengal',
      phone: '+91 98333 45678',
      website: 'https://grandheritage.starvnt.com',
      bio: 'Palatial 25,000 sq.ft pillarless banquet ballroom with manicured open lawns, 4 luxury bridal suites, valet parking for 400 cars, and 1,200+ guest capacity.',
      profilePicUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
      rating: { average: 5.0, count: 320 },
      googlePlaceId: 'place_kolkata_grand_heritage',
    },
    location: {
      label: 'Main Heritage Estate',
      type: 'HEAD_OFFICE',
      address: 'Major Arterial Road, Action Area II, New Town',
      locality: 'New Town',
      city: 'Kolkata',
      state: 'West Bengal',
      postalCode: '700156',
      coordinates: { lat: 22.602, lng: 88.468 },
    },
    services: [
      {
        name: 'Grand Ballroom & Royal Open Lawn Package',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 250000, unit: 'event' },
        deliverables: ['Pillarless AC Ballroom (800 pax)', 'Lush Open Green Lawn (600 pax)', '2 Executive Bridal Suites with AC', 'Full DG Power Backup & Valet Staff'],
        leadTimeDays: 30,
      },
      {
        name: 'Intimate Poolside Lawn & Cocktail Lounge',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 120000, unit: 'event' },
        deliverables: ['Poolside Deck for 250 Guests', 'Built-in Bar Counter & Cabanas', 'Ambient Landscape Lighting', '1 Green Room'],
        leadTimeDays: 15,
      },
    ],
    capabilities: {
      styles: ['Palace Heritage', 'Lawn & Ballroom', 'Poolside', 'Grand Scale'],
      deliverables: ['Venue Rental (24h)', 'Security & Valet Parking', 'Power Backup Generator', 'Bridal Dressing Rooms'],
      teamSize: 30,
      equipment: ['Centrally Air Conditioned', '500kVA Generator', 'CCTV Surveillance'],
    },
    coverage: {
      city: 'Kolkata',
      localities: ['New Town', 'Rajarhat', 'Salt Lake', 'Airport Zone', 'Barasat'],
      radiusKm: 40,
    },
    portfolio: [
      {
        title: 'Illuminated Heritage Palace Facade',
        eventType: 'Wedding',
        style: 'Palace Heritage',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80',
        tags: ['Banquet', 'Palace', 'Grand'],
      },
      {
        title: 'Grand Chandelier Ballroom',
        eventType: 'Reception',
        style: 'Lawn & Ballroom',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=300&q=80',
        tags: ['Interior', 'Chandelier', 'AC Hall'],
      },
    ],
    reviews: [
      {
        customerName: 'Aditya & Tanvi Roy',
        rating: 5,
        reviewText: 'The most majestic venue in Eastern India. Our guests loved the seamless parking and the stunning lawn. Raghav and his estate team were exceptional.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Kabir Malhotra',
      email: 'dj@starvnt.com',
      phone: '+91 98444 56789',
    },
    org: {
      businessName: 'Pulse Audio & Stage FX',
      category: 'Sound',
      location: 'Bandra West, Mumbai, Maharashtra',
      phone: '+91 98444 56789',
      website: 'https://pulsefx.starvnt.com',
      bio: 'Concert-grade sound reinforcement, intelligent Moving Head lighting, club and Bollywood wedding DJs with mind-blowing SFX (cold pyros, dry ice fog, and laser arrays).',
      profilePicUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 164 },
      googlePlaceId: 'place_mumbai_pulse_audio',
    },
    location: {
      label: 'Bandra Sound Lab & Equipment Hub',
      type: 'EQUIPMENT_HUB',
      address: 'Hill Road, Bandra West',
      locality: 'Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
      coordinates: { lat: 19.0596, lng: 72.8295 },
    },
    services: [
      {
        name: 'Concert JBL Line Array & Laser Light Show',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 45000, unit: 'event' },
        deliverables: ['JBL VRX Line Array (4 tops, 2 subs)', '16 Beam Moving Heads with DMX controller', '4 Wireless Shure Microphones', 'Sound Engineer & Technician on-site'],
        leadTimeDays: 5,
      },
      {
        name: 'Celebrity Wedding DJ & Visual LED Console',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 32000, unit: 'event' },
        deliverables: ['Pro DJ Set (Bollywood, EDM, Punjabi Hits)', 'Pioneer Nexus DJ Setup', 'Cold Pyro & Dry Ice Clouds for Couple Entry', 'Curated Custom Music Tracklist'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['Bollywood Sangeet', 'EDM Club Night', 'Punjabi Dhol Mix', 'Retro Classics'],
      deliverables: ['Concert Audio Rig', 'Lighting Console Operator', 'Cold Spark SFX', 'Pioneer Nexus Gear'],
      teamSize: 5,
      equipment: ['JBL VRX Line Array', 'Pioneer CDJ-3000', 'Sharpy 10R Moving Heads', 'Shure SM58 Wireless Mics'],
    },
    coverage: {
      city: 'Mumbai',
      localities: ['Bandra', 'Juhu', 'Andheri', 'Worli', 'Colaba', 'Navi Mumbai'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Sangeet Stage Lighting & DJ Console',
        eventType: 'Sangeet',
        style: 'Bollywood Sangeet',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
        tags: ['DJ', 'Stage Lights', 'Dancefloor'],
      },
    ],
    reviews: [
      {
        customerName: 'Aman & Ritika Kapoor',
        rating: 5,
        reviewText: 'DJ Kabir kept the dancefloor packed until 4 AM! The sound was punchy, clear, and zero feedback issues.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Natasha Mehra',
      email: 'makeup@starvnt.com',
      phone: '+91 98555 67890',
    },
    org: {
      businessName: 'Glamour Glow Bridal Artistry',
      category: 'Makeup',
      location: 'Greater Kailash, Delhi',
      phone: '+91 98555 67890',
      website: 'https://glamourglow.starvnt.com',
      bio: 'Celebrity certified bridal makeup artist specializing in HD airbrush skin-like finishes, timeless smokey eyes, bespoke hair couture, and luxury saree draping.',
      profilePicUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 128 },
      googlePlaceId: 'place_delhi_glamour_glow',
    },
    location: {
      label: 'GK-II Bridal Lounge',
      type: 'STUDIO',
      address: 'M-Block Market, Greater Kailash II',
      locality: 'Greater Kailash',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110048',
      coordinates: { lat: 28.5355, lng: 77.241 },
    },
    services: [
      {
        name: 'Signature HD Airbrush Bridal Makeover',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 28000, unit: 'event' },
        deliverables: ['Temptu HD Airbrush Application', 'International Eyelashes & Lens Fitting', 'Couture Hair Styling with Fresh Florals', 'Bridal Dupatta & Saree Draping', 'Touch-up Kit Included'],
        leadTimeDays: 7,
      },
      {
        name: 'Sangeet & Reception Glam Styling',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 15000, unit: 'event' },
        deliverables: ['Dewy Glass Skin Makeover', 'Glam Hollywood Waves or Textured Bun', 'Lashes & Highlighting', 'Designer Draping'],
        leadTimeDays: 4,
      },
    ],
    capabilities: {
      styles: ['HD Airbrush', 'Dewy Minimalist', 'Royal Glamour', 'Contemporary Soft Glam'],
      deliverables: ['Trial Session Available', 'On-Location Vanity Setup', 'Hair Extension Styling', 'Bridal Draping'],
      teamSize: 3,
      equipment: ['Temptu Pro Airbrush', 'Dyson Airwrap', 'Charlotte Tilbury & Dior Kits'],
    },
    coverage: {
      city: 'Delhi',
      localities: ['Greater Kailash', 'Vasant Vihar', 'Defence Colony', 'Gurgaon', 'Noida'],
      radiusKm: 45,
    },
    portfolio: [
      {
        title: 'Timeless Royal Indian Bride',
        eventType: 'Wedding',
        style: 'Royal Glamour',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        tags: ['Bride', 'Airbrush', 'Jewelry'],
      },
    ],
    reviews: [
      {
        customerName: 'Shreya Bansal',
        rating: 5,
        reviewText: 'Natasha gave me the exact radiant look I dreamed of! My makeup did not smudge even through tears and 10 hours of rituals.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Aftab Hussain',
      email: 'liveband@starvnt.com',
      phone: '+91 98666 78901',
    },
    org: {
      businessName: 'Sufi & Strings Live Ensemble',
      category: 'Entertainment',
      location: 'Hauz Khas, Delhi',
      phone: '+91 98666 78901',
      website: 'https://sufistrings.starvnt.com',
      bio: 'Electrifying 6-piece live band known for soulful Sufi-rock, Bollywood acoustic mashups, and energetic retro dance sets for cocktail evenings and sangeets.',
      profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 96 },
      googlePlaceId: 'place_delhi_sufi_strings',
    },
    location: {
      label: 'Hauz Khas Jam Studio',
      type: 'STUDIO',
      address: 'Hauz Khas Village, New Delhi',
      locality: 'Hauz Khas',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110016',
      coordinates: { lat: 28.5494, lng: 77.1931 },
    },
    services: [
      {
        name: '6-Piece Sufi-Rock Fusion Band (3 Hours Live)',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 65000, unit: 'event' },
        deliverables: ['Lead Vocalist, Violinist, Flutist, Keyboard, Lead Guitar & Drums', '3-Hour Continuous Live Set', 'All Stage Backline & In-Ear Monitors Included', 'Curated Bollywood & Sufi Playlist'],
        leadTimeDays: 14,
      },
      {
        name: 'Acoustic Bollywood Duo for Sundowner High Tea',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 28000, unit: 'event' },
        deliverables: ['Vocalist & Acoustic Guitarist', '2-Hour Laidback Melody Session', 'Compact Bose Audio Column Included'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Sufi Rock', 'Bollywood Acoustic', 'Ghazal Fusion', 'Retro Classics'],
      deliverables: ['Live Instrumentals', 'Custom Couple Request Song', 'Wireless Stage Mics', 'Backline Amplifiers'],
      teamSize: 6,
      equipment: ['Nord Stage 3 Keyboard', 'Fender Stratocaster', 'Roland V-Drums', 'Sennheiser Wireless Mics'],
    },
    coverage: {
      city: 'Delhi',
      localities: ['Hauz Khas', 'Saket', 'Aerocity', 'Gurgaon DLF', 'Noida Expressway'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'High-Energy Sangeet Live Concert',
        eventType: 'Sangeet',
        style: 'Sufi Rock',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
        tags: ['Live Band', 'Concert', 'Violin'],
      },
    ],
    reviews: [
      {
        customerName: 'Devika Singhal',
        rating: 5,
        reviewText: 'Aftab’s voice gave everyone goosebumps. They turned our cocktail party into an unforgettable arena concert!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Tanya & Rohan Mehta',
      email: 'planner@starvnt.com',
      phone: '+91 98777 89012',
    },
    org: {
      businessName: 'Elite Vows Event Planning & Production',
      category: 'Event Planning',
      location: 'Juhu, Mumbai, Maharashtra',
      phone: '+91 98777 89012',
      website: 'https://elitevows.starvnt.com',
      bio: 'Bespoke end-to-end luxury wedding planning, design direction, hospitality logistics, RSVP concierge, and flawless on-ground ceremony execution.',
      profilePicUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
      rating: { average: 5.0, count: 175 },
      googlePlaceId: 'place_mumbai_elite_vows',
    },
    location: {
      label: 'Juhu Planning Studio',
      type: 'HEAD_OFFICE',
      address: 'Gulmohar Road, Juhu Scheme',
      locality: 'Juhu',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400049',
      coordinates: { lat: 19.1075, lng: 72.8263 },
    },
    services: [
      {
        name: '360° Luxury Wedding Curation & Direction',
        category: 'Event Planning',
        pricing: { pricingType: 'FIXED', basePrice: 150000, unit: 'event' },
        deliverables: ['Vendor Negotiation & Contracts Synchronisation', 'Budget & Payment Milestones Tracking', 'Production Itinerary & Show Running', '6 On-Ground Shadow Coordinators'],
        leadTimeDays: 30,
      },
      {
        name: 'Day-Of Coordination & RSVP Concierge',
        category: 'Event Planning',
        pricing: { pricingType: 'FIXED', basePrice: 50000, unit: 'event' },
        deliverables: ['Airport Guest Transfers Management', 'Hotel Room Hampers Distribution', 'Ceremony Timing Coordination', 'Emergency Kit & Bridal Shadow'],
        leadTimeDays: 14,
      },
    ],
    capabilities: {
      styles: ['Destination Wedding', 'Luxury Palatial', 'Intimate Beach', 'Corporate Gala'],
      deliverables: ['Production Timeline', 'Vendor Sync Meetings', 'Hospitality Desk', 'Crisis Management'],
      teamSize: 12,
      equipment: ['Motorola Walkie-Talkies', 'Digital Run-of-Show Tablets', 'VIP Check-In Stations'],
    },
    coverage: {
      city: 'Mumbai',
      localities: ['Juhu', 'Bandra', 'Worli', 'South Mumbai', 'Goa', 'Udaipur'],
      radiusKm: 120,
    },
    portfolio: [
      {
        title: 'Palace Wedding Grand Coordination',
        eventType: 'Wedding',
        style: 'Destination Wedding',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=300&q=80',
        tags: ['Planning', 'Luxury', 'Coordination'],
      },
    ],
    reviews: [
      {
        customerName: 'Kunal & Aanya Merchant',
        rating: 5,
        reviewText: 'We literally did not have to stress for a single second during our 3-day wedding. Tanya & Rohan took care of every tiny detail effortlessly.',
        wouldRecommend: true,
      },
    ],
  },
];

export async function seedRealVendors() {
  const { externalConn } = await import('../src/db/index.js');
  const isAlreadyConnected = Boolean(externalConn && externalConn.readyState === 1);
  if (!isAlreadyConnected) {
    console.log('[seed] Connecting to database...');
    await connectDB();
  }

  const passwordHash = await hashPassword(COMMON_PASSWORD);

  // 1. Ensure Super Admin with COMMON_PASSWORD
  let admin = await AdminUser.findOne({ email: 'admin@starvnt.com' });
  if (admin) {
    admin.passwordHash = passwordHash;
    admin.role = 'SUPER_ADMIN';
    admin.status = 'ACTIVE';
    await admin.save();
    console.log(`[seed] Updated Super Admin: ${admin.email} (Password: ${COMMON_PASSWORD})`);
  } else {
    admin = await AdminUser.create({
      fullName: 'Chief Systems Architect',
      email: 'admin@starvnt.com',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
    console.log(`[seed] Created Super Admin: ${admin.email} (Password: ${COMMON_PASSWORD})`);
  }

  // 2. Ensure Primary Customer with COMMON_PASSWORD
  let customer = await ExternalUser.findOne({ email: 'customer@starvnt.com' });
  if (customer) {
    customer.fullName = 'Ananya Roy';
    customer.passwordHash = passwordHash;
    customer.accountType = 'CUSTOMER';
    customer.roles = ['CUSTOMER'];
    customer.status = 'ACTIVE';
    await customer.save();
    console.log(`[seed] Updated Customer: ${customer.email} (Password: ${COMMON_PASSWORD})`);
  } else {
    customer = await ExternalUser.create({
      fullName: 'Ananya Roy',
      email: 'customer@starvnt.com',
      passwordHash,
      phone: '+91 98300 12345',
      accountType: 'CUSTOMER',
      roles: ['CUSTOMER'],
      status: 'ACTIVE',
    });
    console.log(`[seed] Created Customer: ${customer.email} (Password: ${COMMON_PASSWORD})`);
  }

  console.log(`\n[seed] Seeding ${REAL_VENDORS.length} realistic vendors...`);

  const seededVendorResults = [];

  for (const vData of REAL_VENDORS) {
    // 1. ExternalUser
    let user = await ExternalUser.findOne({ email: vData.owner.email });
    if (user) {
      user.fullName = vData.owner.fullName;
      user.phone = vData.owner.phone;
      user.passwordHash = passwordHash;
      user.accountType = 'VENDOR';
      user.roles = ['VENDOR'];
      user.status = 'ACTIVE';
      await user.save();
    } else {
      user = await ExternalUser.create({
        fullName: vData.owner.fullName,
        email: vData.owner.email,
        passwordHash,
        phone: vData.owner.phone,
        accountType: 'VENDOR',
        roles: ['VENDOR'],
        status: 'ACTIVE',
      });
    }

    // 2. VendorOrganization
    let org = await VendorOrganization.findOne({ owner: user._id });
    if (org) {
      org.businessName = vData.org.businessName;
      org.category = vData.org.category;
      org.location = vData.org.location;
      org.phone = vData.org.phone;
      org.website = vData.org.website;
      org.bio = vData.org.bio;
      org.profilePicUrl = vData.org.profilePicUrl;
      org.status = 'ACTIVE';
      org.activationState = 'ACTIVE';
      org.isCommerciallyActive = true;
      org.isProfileCompleted = true;
      org.verification = { isVerified: true, verifiedAt: new Date() };
      org.rating = vData.org.rating;
      org.googlePlaceId = vData.org.googlePlaceId;
      await org.save();
    } else {
      org = await VendorOrganization.create({
        owner: user._id,
        businessName: vData.org.businessName,
        category: vData.org.category,
        location: vData.org.location,
        phone: vData.org.phone,
        website: vData.org.website,
        bio: vData.org.bio,
        profilePicUrl: vData.org.profilePicUrl,
        status: 'ACTIVE',
        activationState: 'ACTIVE',
        isCommerciallyActive: true,
        isProfileCompleted: true,
        verification: { isVerified: true, verifiedAt: new Date() },
        rating: vData.org.rating,
        googlePlaceId: vData.org.googlePlaceId,
      });
    }

    user.vendorOrganization = org._id;
    await user.save();

    // 3. Operating Location
    await OperatingLocation.findOneAndUpdate(
      { vendor: org._id, isPrimary: true },
      {
        vendor: org._id,
        isPrimary: true,
        label: vData.location.label,
        type: vData.location.type,
        address: vData.location.address,
        locality: vData.location.locality,
        city: vData.location.city,
        state: vData.location.state,
        postalCode: vData.location.postalCode,
        coordinates: vData.location.coordinates,
      },
      { upsert: true, new: true }
    );

    // 4. Services
    const createdServices = [];
    for (const svc of vData.services) {
      const dbSvc = await VendorService.findOneAndUpdate(
        { vendor: org._id, name: svc.name },
        {
          vendor: org._id,
          name: svc.name,
          category: svc.category,
          pricing: svc.pricing,
          deliverables: svc.deliverables,
          leadTimeDays: svc.leadTimeDays,
          status: 'ACTIVE',
        },
        { upsert: true, new: true }
      );
      createdServices.push(dbSvc);
    }

    const primaryService = createdServices[0];

    // 5. Capability
    if (primaryService && vData.capabilities) {
      await VendorCapability.findOneAndUpdate(
        { vendor: org._id, vendorService: primaryService._id },
        {
          vendor: org._id,
          vendorService: primaryService._id,
          styles: vData.capabilities.styles,
          deliverables: vData.capabilities.deliverables,
          teamSize: vData.capabilities.teamSize,
          equipment: vData.capabilities.equipment,
        },
        { upsert: true, new: true }
      );
    }

    // 6. Coverage & Travel
    if (primaryService && vData.coverage) {
      await ServiceCoverage.findOneAndUpdate(
        { vendor: org._id, vendorService: primaryService._id },
        {
          vendor: org._id,
          vendorService: primaryService._id,
          coverageType: 'CITY',
          city: vData.coverage.city,
          localities: vData.coverage.localities,
          radiusKm: vData.coverage.radiusKm,
          confidence: 'VERIFIED',
        },
        { upsert: true, new: true }
      );

      await TravelPolicy.findOneAndUpdate(
        { vendor: org._id },
        {
          vendor: org._id,
          origin: {
            locality: vData.location.locality,
            city: vData.location.city,
            coordinates: vData.location.coordinates,
          },
          freeRadiusKm: 15,
          ratePerKm: 25,
          flatRates: [
            { targetArea: vData.coverage.localities[0] || 'Central Area', flatFee: 1500 },
          ],
        },
        { upsert: true, new: true }
      );
    }

    // 7. Portfolio Items
    if (vData.portfolio?.length) {
      for (const p of vData.portfolio) {
        await PortfolioItem.findOneAndUpdate(
          { vendor: org._id, title: p.title },
          {
            vendor: org._id,
            vendorService: primaryService?._id,
            mediaType: p.mediaType || 'IMAGE',
            url: p.url,
            thumbnailUrl: p.thumbnailUrl,
            originalFilename: `${p.title.replace(/\s+/g, '_').toLowerCase()}.jpg`,
            title: p.title,
            eventType: p.eventType || 'Wedding',
            style: p.style || 'Candid',
            location: {
              venue: 'Grand Celebration Venue',
              locality: vData.location.locality,
              city: vData.location.city,
            },
            tags: p.tags || ['Wedding', 'Celebration'],
            status: 'PUBLISHED',
          },
          { upsert: true, new: true }
        );
      }
    }

    // 8. Reviews
    if (vData.reviews?.length) {
      for (const r of vData.reviews) {
        await VendorReview.findOneAndUpdate(
          { vendor: org._id, customerName: r.customerName },
          {
            vendor: org._id,
            customer: customer._id,
            customerName: r.customerName,
            serviceName: primaryService?.name || vData.org.category,
            eventType: 'Wedding',
            rating: r.rating,
            reviewText: r.reviewText,
            wouldRecommend: r.wouldRecommend ?? true,
            isVerified: true,
            status: 'PUBLISHED',
          },
          { upsert: true, new: true }
        );
      }
    }

    // 9. Operational Notifications
    const existingNotifCount = await Notification.countDocuments({ vendor: org._id });
    if (existingNotifCount === 0) {
      await Notification.create([
        {
          vendor: org._id,
          title: `New ${vData.org.category} lead received`,
          message: `Wedding Celebration · ${vData.location.city} · View requirements`,
          type: 'ENQUIRY',
          link: '/vendor/enquiries',
          isRead: false,
        },
        {
          vendor: org._id,
          title: 'Quote requested by client',
          message: `Ananya Roy requested an official quote for ${primaryService?.name || vData.org.category}`,
          type: 'QUOTE',
          link: '/vendor/quotes',
          isRead: false,
        },
      ]);
    }

    // 10. Sample Core Bookings & Opportunities
    const existingOppCount = await Opportunity.countDocuments({ vendor: org._id });
    if (existingOppCount === 0) {
      await Opportunity.create({
        vendor: org._id,
        customer: customer._id,
        vendorService: primaryService?._id,
        serviceName: primaryService?.name || vData.org.category,
        eventDate: '2026-12-18',
        serviceLocation: { address: 'Grand Heritage Palace', locality: vData.location.locality, city: vData.location.city },
        guestCount: 350,
        requiredCapability: `Verified requirements for ${vData.org.category}`,
        estimatedTravel: '12 km',
        travelCost: 1500,
        status: 'NEW',
        action: 'Prepare Quote',
      });
    }

    const existingBookingCount = await CoreBooking.countDocuments({ vendorId: org._id });
    if (existingBookingCount === 0) {
      await CoreBooking.create({
        bookingReference: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
        vendorId: org._id,
        vendorName: vData.org.businessName,
        customerId: customer._id,
        customerName: 'Ananya Roy',
        serviceName: primaryService?.name || vData.org.category,
        category: vData.org.category,
        eventDate: '2026-11-28',
        serviceLocation: { address: 'Grand Palace', locality: vData.location.locality, city: vData.location.city },
        totalAmount: primaryService?.pricing?.basePrice || 45000,
        pricing: { basePrice: primaryService?.pricing?.basePrice || 45000, travelFee: 1500, totalAmount: (primaryService?.pricing?.basePrice || 45000) + 1500 },
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'PAYMENT_VERIFIED',
        executionStatus: 'SERVICE_SCHEDULED',
        settlementStatus: 'NOT_ELIGIBLE',
      });
    }

    seededVendorResults.push({
      email: vData.owner.email,
      businessName: vData.org.businessName,
      category: vData.org.category,
      city: vData.location.city,
      rating: vData.org.rating.average,
    });

    console.log(`[seed] ✓ ${vData.org.businessName} (${vData.owner.email}) - ${vData.org.category}`);
  }

  console.log('\n========================================================================');
  console.log('✓ REAL VENDORS SEEDED SUCCESSFULLY! ALL ACCOUNTS USE THE SAME PASSWORD:');
  console.log(`  PASSWORD: ${COMMON_PASSWORD}`);
  console.log('========================================================================');
  console.log('  Role      | Email                  | Business / Owner');
  console.log('  ----------+------------------------+-----------------------------------');
  console.log(`  Admin     | admin@starvnt.com      | Super Admin`);
  console.log(`  Customer  | customer@starvnt.com   | Ananya Roy`);
  for (const sv of seededVendorResults) {
    console.log(`  Vendor    | ${sv.email.padEnd(22)} | ${sv.businessName} (${sv.category})`);
  }
  console.log('========================================================================\n');

  if (!isAlreadyConnected) {
    await disconnectDB();
  }
}

if (process.argv[1]?.endsWith('seed-real-vendors.js')) {
  seedRealVendors().catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  });
}
