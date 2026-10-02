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
      businessName: 'Himalayan Moments & Wedding Studio',
      category: 'Photography',
      location: 'Main Market, Kapkote, Bageshwar, Uttarakhand',
      phone: '+91 98765 43210',
      website: 'https://himalayanmoments.starvnt.com',
      bio: 'Award-winning wedding & cinematic film studio based in Kapkote, capturing majestic Himalayan love stories. Specializing in Pahadi rituals, fine-art portraits, emotional teasers, and drone aerial cinematography across Bageshwar & Kumaon.',
      profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 142 },
      googlePlaceId: 'place_kapkote_himalayan_moments',
    },
    location: {
      label: 'Kapkote Main Studio',
      type: 'STUDIO',
      address: 'Main Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9442, lng: 79.9042 },
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
        name: 'Pre-Wedding & Pahadi Concept Shoot',
        category: 'Photography',
        pricing: { pricingType: 'FIXED', basePrice: 22000, unit: 'event' },
        deliverables: ['15 Retouched High-Res Images', '1-min Instagram Reel', 'Drone Concept Video', '2 Outfit Changes'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Candid', 'Cinematic', 'Fine Art', 'Aerial Drone', 'Traditional Pahadi'],
      deliverables: ['High-Res Album', 'Teaser Film', 'Full Event Video', 'Raw Footage'],
      teamSize: 3,
      equipment: ['Sony A7IV', 'Sony FX3', 'DJI Ronin RS3', 'DJI Mini 4 Pro Drone'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Kausani', 'Almora', 'Bharadi', 'Shama', 'Haldwani'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Himalayan Ridge Royal Wedding',
        eventType: 'Wedding',
        style: 'Cinematic',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=300&q=80',
        tags: ['Wedding', 'Varmala', 'Himalayas'],
      },
      {
        title: 'Kumaon Golden Hour Couple Portrait',
        eventType: 'Pre-wedding',
        style: 'Candid',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=300&q=80',
        tags: ['Outdoor', 'Golden Hour', 'Couple'],
      },
    ],
    reviews: [
      {
        customerName: 'Ananya & Rohan Sengupta',
        rating: 5,
        reviewText: 'Arun and his team captured our Kapkote wedding so gracefully! The teaser film made my entire family cry happy tears. Highly recommend them!',
        wouldRecommend: true,
      },
      {
        customerName: 'Pooja Joshi',
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
      businessName: 'Royal Kumaoni Feast & Traditional Catering',
      category: 'Catering',
      location: 'Bageshwar Road, Kapkote, Uttarakhand',
      phone: '+91 98111 23456',
      website: 'https://royalkumaonifeast.starvnt.com',
      bio: 'Authentic Kumaoni and North Indian wedding feasts. Featuring Bhatt ki Churkani, Chainsu, Aloo ke Gutke, authentic Pahadi Raita, live artisanal counters, and royal dessert spreads.',
      profilePicUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 215 },
      googlePlaceId: 'place_kapkote_royal_feast',
    },
    location: {
      label: 'Kapkote Catering Hub & Kitchen',
      type: 'KITCHEN',
      address: 'Bageshwar Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.945, lng: 79.905 },
    },
    services: [
      {
        name: 'Royal Kumaoni & North Indian Wedding Feast',
        category: 'Catering',
        pricing: { pricingType: 'FIXED', basePrice: 1250, unit: 'plate' },
        deliverables: ['Pahadi Welcome Drinks & Buransh Juice', '8 Live Starters', 'Traditional Kumaoni & North Indian Main Course (16 items)', 'Singodi & Bal Mithai Dessert Station', 'Uniformed Service Crew'],
        leadTimeDays: 10,
      },
      {
        name: 'Live Chaat & Mountain Street Food Carnival',
        category: 'Catering',
        pricing: { pricingType: 'FIXED', basePrice: 38000, unit: 'event' },
        deliverables: ['Traditional Pahadi Chaat & Golgappa Counter', 'Hot Jalebi & Rabri Station', 'Momos & Thukpa Bar', 'Customized Mocktails'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Kumaoni Traditional', 'North Indian Mughlai', 'Live Counters', 'Pure Vegetarian Available'],
      deliverables: ['Custom Menu Tasting', 'Buffet Styling & Warmers', 'Uniformed Waitstaff', 'Premium Crockery'],
      teamSize: 20,
      equipment: ['Mobile Commercial Kitchen Equipment', 'Chafing Warmers', 'Live Tandoor Sets'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Kausani', 'Almora', 'Bharadi'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Authentic Pahadi Wedding Feast',
        eventType: 'Wedding',
        style: 'Kumaoni Traditional',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=300&q=80',
        tags: ['Gourmet', 'Live Counter', 'Buffet'],
      },
    ],
    reviews: [
      {
        customerName: 'Vikram & Simran Khurana',
        rating: 5,
        reviewText: 'The food was the absolute highlight of our celebration in Kapkote! Guests are still raving about the Kumaoni delicacies and warm service.',
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
      businessName: 'Pahadi Varmala & Grandeur Event Decor',
      category: 'Decoration',
      location: 'Bharadi Bazar, Kapkote, Uttarakhand',
      phone: '+91 98222 34567',
      website: 'https://pahadivarmala.starvnt.com',
      bio: 'Creating breathtaking visual experiences across Uttarakhand: mountain view mandaps, traditional marigold & pine installations, ambient fairy-light canopies, and luxury stage sets.',
      profilePicUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 188 },
      googlePlaceId: 'place_kapkote_pahadi_decor',
    },
    location: {
      label: 'Kapkote Decor Studio & Warehouse',
      type: 'STUDIO',
      address: 'Bharadi Bazar, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.943, lng: 79.903 },
    },
    services: [
      {
        name: 'Himalayan View Floral Mandap & Luxury Stage',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 125000, unit: 'event' },
        deliverables: ['Custom Open-Air Himalayan Floral Mandap', 'Royal Stage Backdrop with Chandeliers', 'Entry Floral Tunnel (50 ft)', 'Varmala Setup with Cold Pyros'],
        leadTimeDays: 7,
      },
      {
        name: 'Pine Valley Fairy Light & Reception Canopy',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 65000, unit: 'event' },
        deliverables: ['8,000 Warm White Fairy Lights Canopy', 'Vintage Lanterns & Edison Bulb Accents', 'Lounge Seating with Velvet Cushions', 'Traditional Wooden Photo Booth'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Pahadi Traditional', 'Royal Regal', 'Pastel Boho', 'Rustic Pine', 'Minimalist Elegance'],
      deliverables: ['3D Venue Renders', 'Fresh Mountain Florals', 'Custom Furniture & Drapes', 'Mood Lighting Coordination'],
      teamSize: 15,
      equipment: ['Truss Systems', 'Fairy Light Curtains', 'Crystal Chandeliers', 'Custom Brass Props'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Almora', 'Bharadi', 'Kausani'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Himalayan Ridge Floral Mandap',
        eventType: 'Wedding',
        style: 'Pahadi Traditional',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=300&q=80',
        tags: ['Mandap', 'Florals', 'Himalayas'],
      },
    ],
    reviews: [
      {
        customerName: 'Meera & Siddharth Joshi',
        rating: 5,
        reviewText: 'Priya transformed an open hillside in Kapkote into a fairytale wedding venue! Breathtaking mandap setup.',
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
      businessName: 'Himalayan Heritage Pine Lawns & Resort',
      category: 'Venue',
      location: 'Kapkote-Bageshwar Highway, Kapkote, Uttarakhand',
      phone: '+91 98333 45678',
      website: 'https://himalayanheritage.starvnt.com',
      bio: 'Picturesque valley-facing wedding resort featuring 20,000 sq.ft manicured pine lawns, banquet hall, luxury mountain cottages for family stay, and scenic panoramic views of Kumaon peaks.',
      profilePicUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
      rating: { average: 5.0, count: 320 },
      googlePlaceId: 'place_kapkote_himalayan_heritage',
    },
    location: {
      label: 'Main Resort & Lawns',
      type: 'HEAD_OFFICE',
      address: 'Kapkote-Bageshwar Highway, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.94, lng: 79.9 },
    },
    services: [
      {
        name: 'Grand Himalayan Pine Lawn & Banquet Package',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 150000, unit: 'event' },
        deliverables: ['Valley-View Open Lawn (800 pax)', 'Covered Banquet Hall (400 pax)', '4 Luxury Family Cottages for stay', '24/7 Silent DG Power Backup & Parking'],
        leadTimeDays: 20,
      },
      {
        name: 'Sunset Terrace & Intimate Sangeet Deck',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 75000, unit: 'event' },
        deliverables: ['Panoramic Mountain Deck for 250 Guests', 'Built-in Bonfire & Bar Lounge', 'Ambient Landscape Lighting', 'Green Rooms for Bridal Prep'],
        leadTimeDays: 10,
      },
    ],
    capabilities: {
      styles: ['Himalayan Resort', 'Pine Lawn & Hall', 'Mountain View', 'Destination Wedding'],
      deliverables: ['Venue Rental (24h)', 'Security & Parking Management', 'Power Backup Generator', 'Bridal Dressing Rooms'],
      teamSize: 20,
      equipment: ['Commercial Genset 125kVA', 'CCTV Surveillance', 'Water Supply & Filtration'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Pine Lawn Sunset Wedding Ceremony',
        eventType: 'Wedding',
        style: 'Mountain View',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80',
        tags: ['Resort', 'Himalayas', 'Lawn'],
      },
    ],
    reviews: [
      {
        customerName: 'Aditya & Tanvi Roy',
        rating: 5,
        reviewText: 'The most scenic venue in Kumaon. Our wedding guests loved the mountain breeze, cottages, and starry night skies.',
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
      businessName: 'Kumaon Beats & Sound FX (DJ & Audio)',
      category: 'Sound',
      location: 'Main Market, Kapkote, Bageshwar, Uttarakhand',
      phone: '+91 98444 56789',
      website: 'https://kumaonbeats.starvnt.com',
      bio: 'Concert-grade sound reinforcement, intelligent moving heads, high-energy Bollywood, Punjabi & Pahadi wedding DJ, cold pyros, and dry ice clouds across Kapkote and Bageshwar.',
      profilePicUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 164 },
      googlePlaceId: 'place_kapkote_kumaon_beats',
    },
    location: {
      label: 'Kapkote Sound Equipment Lab',
      type: 'EQUIPMENT_HUB',
      address: 'Main Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9445, lng: 79.904 },
    },
    services: [
      {
        name: 'Concert JBL Sound Rig & Mountain Stage Lights',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 35000, unit: 'event' },
        deliverables: ['JBL Line Array Tops & Dual Subs', '12 Beam Moving Heads with DMX Lighting', '4 Wireless Shure Mics', 'Dedicated Sound Engineer'],
        leadTimeDays: 3,
      },
      {
        name: 'Pahadi & Bollywood Wedding DJ Experience',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 25000, unit: 'event' },
        deliverables: ['Pioneer DJ Console Setup', 'Bespoke Bollywood, Punjabi & Kumaoni Mashup Sets', 'Cold Pyro & Dry Ice Clouds for Varmala', 'Custom Dancefloor Lighting'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Pahadi Dhol & Fusion', 'Bollywood Sangeet', 'Punjabi Hits', 'EDM Party'],
      deliverables: ['Concert Audio Rig', 'Lighting Console Operator', 'Cold Spark SFX', 'Pioneer DJ Gear'],
      teamSize: 5,
      equipment: ['JBL Line Array', 'Pioneer DDJ/CDJ Setup', 'Sharpy 10R Moving Heads', 'Shure Wireless Mics'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Almora', 'Haldwani', 'Bharadi'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Open Valley Sangeet Stage & DJ Set',
        eventType: 'Sangeet',
        style: 'Pahadi Dhol & Fusion',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
        tags: ['DJ', 'Stage Lights', 'Dancefloor'],
      },
    ],
    reviews: [
      {
        customerName: 'Aman & Ritika Rawat',
        rating: 5,
        reviewText: 'DJ Kabir had the entire valley dancing till late night! The sound was crystal clear and the Pahadi-Bollywood remixes were pure fire.',
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
      businessName: 'Pahadi Bridal Glow & Artistry Studio',
      category: 'Makeup',
      location: 'Kapkote Bazar, Bageshwar, Uttarakhand',
      phone: '+91 98555 67890',
      website: 'https://pahadiglow.starvnt.com',
      bio: 'Specialist bridal makeover artist celebrating traditional Kumaoni Nath and Pichora draping with modern HD Airbrush long-lasting formulas designed for mountain weather.',
      profilePicUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 128 },
      googlePlaceId: 'place_kapkote_pahadi_glow',
    },
    location: {
      label: 'Kapkote Bridal Studio',
      type: 'STUDIO',
      address: 'Kapkote Bazar, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.944, lng: 79.9045 },
    },
    services: [
      {
        name: 'Signature HD Bridal Makeover with Pichora Draping',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 22000, unit: 'event' },
        deliverables: ['HD Airbrush Long-Wear Base', 'Traditional Kumaoni Pichora & Jewelry Setting', 'Intricate Floral Hair Bun', 'Touch-Up Kit for the Evening'],
        leadTimeDays: 5,
      },
      {
        name: 'Sangeet & Reception Dewy Glow Styling',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 12000, unit: 'event' },
        deliverables: ['Glass Skin Dewy Finish', 'Hollywood Waves or Textured Braid', 'Lashes & Highlighting', 'Dupatta Styling'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['Pahadi Traditional', 'HD Airbrush', 'Dewy Minimalist', 'Royal Glamour'],
      deliverables: ['On-Location Mountain Service', 'Pichora Draping Mastery', 'Hair Extensions Styling'],
      teamSize: 3,
      equipment: ['Temptu Pro Airbrush', 'Dyson Airwrap', 'Dior & MAC Professional Kits'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora', 'Bharadi'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Traditional Kumaoni Bride with Royal Nath',
        eventType: 'Wedding',
        style: 'Pahadi Traditional',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        tags: ['Bride', 'Pichora', 'Nath'],
      },
    ],
    reviews: [
      {
        customerName: 'Shreya Upadhyay',
        rating: 5,
        reviewText: 'Natasha draped my grandmother’s heirloom Pichora with such elegance. The makeup didn’t budge all evening despite the chilly Kapkote wind!',
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
      businessName: 'Kumaon Folk & Fusion Live Ensemble',
      category: 'Entertainment',
      location: 'Kapkote Valley, Bageshwar, Uttarakhand',
      phone: '+91 98666 78901',
      website: 'https://kumaonfolkfusion.starvnt.com',
      bio: 'Soulful live band fusing traditional Uttarakhand folk instruments (Ransingha, Dhol Damau, Hurka, Flute) with modern acoustic rock and Bollywood sangeet hits.',
      profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 96 },
      googlePlaceId: 'place_kapkote_live_ensemble',
    },
    location: {
      label: 'Kapkote Valley Rehearsal Studio',
      type: 'STUDIO',
      address: 'Kapkote Valley Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.946, lng: 79.906 },
    },
    services: [
      {
        name: 'Traditional Pahadi Folk & Bollywood Fusion (3 Hours Live)',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 45000, unit: 'event' },
        deliverables: ['Lead Vocalists, Flutist, Hurka, Dhol Damau & Keyboard Player', '3 Hours Continuous Live Performance', 'All Stage Mics & Monitors Included', 'Chholiya Dance Welcoming Trope Available'],
        leadTimeDays: 7,
      },
      {
        name: 'Acoustic Sunset Melody Duo for Hi-Tea',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 18000, unit: 'event' },
        deliverables: ['Vocalist & Acoustic Guitarist', '2-Hour Mountain Sunset Session', 'Compact Portable Sound System'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['Kumaoni Folk Fusion', 'Sufi Rock', 'Bollywood Acoustic', 'Chholiya Welcome'],
      deliverables: ['Live Traditional Instruments', 'Custom Song Requests', 'Wireless Stage Rig'],
      teamSize: 6,
      equipment: ['Yamaha Keyboard', 'Acoustic Guitars', 'Pahadi Percussion Set', 'Wireless Mics'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora'],
      radiusKm: 80,
    },
    portfolio: [
      {
        title: 'High Mountain Valley Live Concert',
        eventType: 'Sangeet',
        style: 'Kumaoni Folk Fusion',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
        tags: ['Live Band', 'Folk', 'Himalayas'],
      },
    ],
    reviews: [
      {
        customerName: 'Devika Pandey',
        rating: 5,
        reviewText: 'The folk fusion performance was the heart of our sangeet in Kapkote. Everyone from grandparents to college cousins was dancing!',
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
      businessName: 'Devbhoomi Vows Wedding Planning & Production',
      category: 'Event Planning',
      location: 'Upper Market, Kapkote, Bageshwar, Uttarakhand',
      phone: '+91 98777 89012',
      website: 'https://devbhoomivows.starvnt.com',
      bio: 'Destination wedding planners specializing in Himalayan mountain ceremonies across Kapkote, Bageshwar, Kausani, and Almora. Complete logistics, guest transfer from Kathgodam/Pantnagar, vendor synchronization, and ceremony execution.',
      profilePicUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
      rating: { average: 5.0, count: 175 },
      googlePlaceId: 'place_kapkote_devbhoomi_vows',
    },
    location: {
      label: 'Kapkote Operations Office',
      type: 'HEAD_OFFICE',
      address: 'Upper Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9442, lng: 79.9042 },
    },
    services: [
      {
        name: '360° Himalayan Destination Wedding Curation',
        category: 'Event Planning',
        pricing: { pricingType: 'FIXED', basePrice: 95000, unit: 'event' },
        deliverables: ['Kathgodam/Pantnagar Guest Transfers & Travel Coordination', 'Complete Vendor Contracts & Timing Management', 'Local Permission & Power Backup Safeguards', '4 On-Ground Shadow Coordinators'],
        leadTimeDays: 20,
      },
      {
        name: 'Day-Of Coordination & Hospitality Concierge',
        category: 'Event Planning',
        pricing: { pricingType: 'FIXED', basePrice: 35000, unit: 'event' },
        deliverables: ['Resort Check-In & Welcome Basket Distribution', 'Ceremony Timing Coordination', 'Emergency Kit & Bridal Shadowing'],
        leadTimeDays: 10,
      },
    ],
    capabilities: {
      styles: ['Destination Wedding', 'Himalayan Ridge', 'Pahadi Rituals', 'Intimate Mountain Gathering'],
      deliverables: ['Mountain Logistics Plan', 'Vendor Sync Meetings', 'Hospitality Desk', 'Weather Backups'],
      teamSize: 8,
      equipment: ['Walkie-Talkie Set', 'Run-of-Show Digital Tablets', 'Hospitality Desk Kits'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Almora', 'Kausani', 'Nainital', 'Haldwani'],
      radiusKm: 100,
    },
    portfolio: [
      {
        title: 'Himalayan Valley Destination Wedding Coordination',
        eventType: 'Wedding',
        style: 'Destination Wedding',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=300&q=80',
        tags: ['Planning', 'Himalayas', 'Coordination'],
      },
    ],
    reviews: [
      {
        customerName: 'Kunal & Aanya Merchant',
        rating: 5,
        reviewText: 'Planning our wedding in Kapkote from Delhi seemed daunting, but Tanya & Rohan made it completely effortless! Every single guest was amazed.',
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

    // 10. Sample Core Bookings & Opportunities & Quotes updated to Kapkote
    const { Quote } = await import('../src/external/models/Quote.js');
    await Opportunity.updateMany(
      { vendor: org._id },
      {
        $set: {
          serviceLocation: {
            address: 'Pine Heritage Lawn & Resort, Main Road',
            locality: vData.location.locality,
            city: vData.location.city,
            state: 'Uttarakhand',
          },
        },
      }
    );
    const existingOppCount = await Opportunity.countDocuments({ vendor: org._id });
    if (existingOppCount === 0) {
      await Opportunity.create({
        vendor: org._id,
        customer: customer._id,
        vendorService: primaryService?._id,
        serviceName: primaryService?.name || vData.org.category,
        eventDate: '2026-12-18',
        serviceLocation: {
          address: 'Pine Heritage Lawn & Resort, Main Road',
          locality: vData.location.locality,
          city: vData.location.city,
          state: 'Uttarakhand',
        },
        guestCount: 350,
        requiredCapability: `Verified requirements for ${vData.org.category}`,
        estimatedTravel: '5 km',
        travelCost: 500,
        status: 'NEW',
        action: 'Prepare Quote',
      });
    }

    await CoreBooking.updateMany(
      { vendorId: org._id },
      {
        $set: {
          serviceLocation: {
            address: 'Pine Heritage Lawns, Kapkote',
            locality: vData.location.locality,
            city: vData.location.city,
            state: 'Uttarakhand',
          },
        },
      }
    );
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
        serviceLocation: {
          address: 'Pine Heritage Lawns, Kapkote',
          locality: vData.location.locality,
          city: vData.location.city,
          state: 'Uttarakhand',
        },
        totalAmount: primaryService?.pricing?.basePrice || 45000,
        pricing: {
          basePrice: primaryService?.pricing?.basePrice || 45000,
          travelFee: 500,
          totalAmount: (primaryService?.pricing?.basePrice || 45000) + 500,
        },
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'PAYMENT_VERIFIED',
        executionStatus: 'SERVICE_SCHEDULED',
        settlementStatus: 'NOT_ELIGIBLE',
      });
    }

    await Quote.updateMany(
      { vendor: org._id },
      {
        $set: {
          serviceLocation: {
            address: 'Pine Heritage Lawns, Kapkote',
            locality: vData.location.locality,
            city: vData.location.city,
            state: 'Uttarakhand',
          },
        },
      }
    );

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
