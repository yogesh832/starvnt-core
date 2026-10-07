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
import { DemoListing } from '../src/customer/models/index.js';

export const COMMON_PASSWORD = 'Password123';

export const REAL_VENDORS = [
  // ─── 1. PHOTOGRAPHY (3 Vendors) ─────────────────────────────────────────────
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
    ],
  },
  {
    owner: {
      fullName: 'Vikram Negi',
      email: 'photo2@starvnt.com',
      phone: '+91 98765 11111',
    },
    org: {
      businessName: 'Kumaon Candid & Birthday Reel Stories',
      category: 'Photography',
      location: 'Station Road, Kapkote, Bageshwar, Uttarakhand',
      phone: '+91 98765 11111',
      website: 'https://kumaoncandid.starvnt.com',
      bio: 'Specialized birthday & family event storytellers in Kapkote. High-energy candid moments, instant polaroid stations, 4K Instagram reels, and playful cake-smash portraits.',
      profilePicUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 98 },
      googlePlaceId: 'place_kapkote_candid_reels',
    },
    location: {
      label: 'Kapkote Creative Lab',
      type: 'STUDIO',
      address: 'Station Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9448, lng: 79.9048 },
    },
    services: [
      {
        name: 'Birthday Party Candid & 4K Reel Package',
        category: 'Photography',
        pricing: { pricingType: 'FIXED', basePrice: 18000, unit: 'event' },
        deliverables: ['Full Birthday Event Coverage', '300+ Retouched Photos', '2 Trendy 4K Instagram Reels', 'Digital Delivery within 48 Hours'],
        leadTimeDays: 3,
      },
      {
        name: 'Instant Polaroid Corner & Mini Photo Book',
        category: 'Photography',
        pricing: { pricingType: 'FIXED', basePrice: 12000, unit: 'event' },
        deliverables: ['50 Printed Instant Polaroids for Guests', 'Custom Hardcover Photo Book', 'Props & Backdrop Included'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Candid', 'Reels & Short Video', 'Party Portraits', 'Instant Prints'],
      deliverables: ['4K Reels', 'Digital Photo Gallery', 'Polaroid Prints'],
      teamSize: 2,
      equipment: ['Canon R6 Mark II', 'DJI Osmo Pocket 3', 'Godox V1 Flashes'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Bharadi'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Kapkote Mountain Birthday Celebration',
        eventType: 'Birthday',
        style: 'Candid',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=300&q=80',
        tags: ['Birthday', 'Party', 'Candid'],
      },
    ],
    reviews: [
      {
        customerName: 'Sanjay Koranga',
        rating: 5,
        reviewText: 'Vikram covered my daughter 5th birthday party in Kapkote. The reels were super viral on Instagram and the polaroid corner was a massive hit!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Deepak Pant',
      email: 'photo3@starvnt.com',
      phone: '+91 98765 22222',
    },
    org: {
      businessName: 'Valley Peak Photography & Drone Films',
      category: 'Photography',
      location: 'Bageshwar Road, Kapkote, Uttarakhand',
      phone: '+91 98765 22222',
      website: 'https://valleypeak.starvnt.com',
      bio: 'Budget-friendly professional event photographers in Kapkote. Delivering crisp portraits, group family photos, and aerial drone footage for birthdays, anniversaries, and family functions.',
      profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 75 },
      googlePlaceId: 'place_kapkote_valley_peak',
    },
    location: {
      label: 'Valley Peak Studio',
      type: 'STUDIO',
      address: 'Bageshwar Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9452, lng: 79.9052 },
    },
    services: [
      {
        name: 'Essential Birthday & Family Function Shoot',
        category: 'Photography',
        pricing: { pricingType: 'FIXED', basePrice: 14000, unit: 'event' },
        deliverables: ['3 Hours Event Coverage', '200 High-Res Edited Photos', 'Family Group Portrait Session', 'Google Drive Link'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['Traditional', 'Portrait', 'Outdoor', 'Drone Photography'],
      deliverables: ['Edited High-Res Photos', 'Drone Clips'],
      teamSize: 2,
      equipment: ['Nikon Z6 II', 'DJI Mini 3 Pro Drone'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Valley Outdoor Birthday Party',
        eventType: 'Birthday',
        style: 'Outdoor',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=300&q=80',
        tags: ['Birthday', 'Outdoor', 'Family'],
      },
    ],
    reviews: [
      {
        customerName: 'Manish Danu',
        rating: 5,
        reviewText: 'Punctual, professional, and very affordable! Captured all the fun moments of our family celebration in Kapkote.',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 2. CATERING (3 Vendors) ───────────────────────────────────────────────
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
      bio: 'Authentic Kumaoni and North Indian wedding & party feasts. Featuring Bhatt ki Churkani, Chainsu, Aloo ke Gutke, authentic Pahadi Raita, live artisanal counters, and royal dessert spreads.',
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
        name: 'Royal Kumaoni & North Indian Feast',
        category: 'Catering',
        pricing: { pricingType: 'PER_PERSON', basePrice: 850, unit: 'guest' },
        deliverables: ['Pahadi Welcome Drinks & Buransh Juice', '4 Live Starters', 'Traditional Kumaoni & North Indian Main Course (12 items)', 'Singodi & Bal Mithai Dessert Station', 'Uniformed Service Crew'],
        leadTimeDays: 7,
      },
      {
        name: 'Live Chaat & Mountain Street Food Carnival',
        category: 'Catering',
        pricing: { pricingType: 'FIXED', basePrice: 28000, unit: 'event' },
        deliverables: ['Traditional Pahadi Chaat & Golgappa Counter', 'Hot Jalebi & Rabri Station', 'Momos & Thukpa Bar', 'Customized Mocktails'],
        leadTimeDays: 4,
      },
    ],
    capabilities: {
      styles: ['Kumaoni Traditional', 'North Indian Mughlai', 'Live Counters', 'Pure Vegetarian Available'],
      deliverables: ['Custom Menu Tasting', 'Buffet Styling & Warmers', 'Uniformed Waitstaff', 'Premium Crockery'],
      teamSize: 15,
      equipment: ['Mobile Commercial Kitchen Equipment', 'Chafing Warmers', 'Live Tandoor Sets'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Kausani', 'Almora', 'Bharadi'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Authentic Pahadi Party Feast',
        eventType: 'Birthday',
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
      fullName: 'Ramesh Singh Bisht',
      email: 'catering2@starvnt.com',
      phone: '+91 98111 33333',
    },
    org: {
      businessName: 'Mountain Bites & Birthday Party Catering',
      category: 'Catering',
      location: 'Upper Bazaar, Kapkote, Uttarakhand',
      phone: '+91 98111 33333',
      website: 'https://mountainbites.starvnt.com',
      bio: 'Popular birthday & party caterer in Kapkote. Offering kid-friendly menus, live pizza & pasta stations, mini burgers, dessert tables, and custom birthday cakes.',
      profilePicUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 110 },
      googlePlaceId: 'place_kapkote_mountain_bites',
    },
    location: {
      label: 'Mountain Bites Central Kitchen',
      type: 'KITCHEN',
      address: 'Upper Bazaar, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9438, lng: 79.9038 },
    },
    services: [
      {
        name: 'Deluxe Birthday Party Buffet & Live Snacks',
        category: 'Catering',
        pricing: { pricingType: 'PER_PERSON', basePrice: 450, unit: 'guest' },
        deliverables: ['Live Woodfired Pizza & Pasta Bar', 'Mini Sliders & French Fries Counter', 'Mocktail Bar', 'Cupcake Tower & Fruit Fondue'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['Continental', 'Fast Food & Snacks', 'Live Counters', 'Dessert Tables'],
      deliverables: ['Kid-Friendly Buffet Setup', 'Live Cooking Stations', 'Theme Crockery'],
      teamSize: 8,
      equipment: ['Portable Woodfire Pizza Oven', 'Chocolate Fountain', 'Juice Dispenser'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Bharadi'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Kid Birthday Dessert & Snack Spread',
        eventType: 'Birthday',
        style: 'Continental',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=300&q=80',
        tags: ['Snacks', 'Desserts', 'Kids'],
      },
    ],
    reviews: [
      {
        customerName: 'Priya Joshi',
        rating: 5,
        reviewText: 'Ramesh team catered my son 7th birthday in Kapkote. Kids loved the live pizza counter and chocolate fountain!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Kamal Mehta',
      email: 'catering3@starvnt.com',
      phone: '+91 98111 44444',
    },
    org: {
      businessName: 'Grand Bageshwar Feast & Gourmet Catering',
      category: 'Catering',
      location: 'Kapkote Highway, Bageshwar, Uttarakhand',
      phone: '+91 98111 44444',
      website: 'https://grandbageshwar.starvnt.com',
      bio: 'High-end gourmet catering for large birthday galas and anniversary celebrations. Multi-cuisine menus combining Chinese, Italian, North Indian, and authentic Kumaoni sweets.',
      profilePicUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 180 },
      googlePlaceId: 'place_kapkote_grand_bageshwar',
    },
    location: {
      label: 'Grand Bageshwar Kitchen',
      type: 'KITCHEN',
      address: 'Kapkote Highway, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.946, lng: 79.906 },
    },
    services: [
      {
        name: 'Grand Birthday Gala Multi-Cuisine Feast',
        category: 'Catering',
        pricing: { pricingType: 'PER_PERSON', basePrice: 650, unit: 'guest' },
        deliverables: ['Welcome Mocktails & Cold Coffee Bar', '6 Live Appetizers', 'Multi-Cuisine Main Course (14 dishes)', 'Live Ice Cream & Brownie Station'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Multi-Cuisine', 'Chinese & Indo-Italian', 'North Indian', 'Gourmet Desserts'],
      deliverables: ['Full Banquet Buffet', 'Uniformed Waiters', 'Glassware & Cutlery'],
      teamSize: 12,
      equipment: ['Commercial Bain Marie', 'Ice Cream Display Freezer', 'Beverage Towers'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora', 'Kanda'],
      radiusKm: 70,
    },
    portfolio: [
      {
        title: 'Grand Birthday Party Gourmet Buffet',
        eventType: 'Birthday',
        style: 'Multi-Cuisine',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=300&q=80',
        tags: ['Gourmet', 'Buffet', 'Multi-Cuisine'],
      },
    ],
    reviews: [
      {
        customerName: 'Geeta Karki',
        rating: 5,
        reviewText: 'Superb food quality! The brownie ice cream station and Chinese live wok were huge hits among all guests.',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 3. DECORATION (3 Vendors) ─────────────────────────────────────────────
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
      bio: 'Creating breathtaking visual experiences across Uttarakhand: mountain view mandaps, birthday theme backdrops, fairy-light canopies, and luxury stage sets.',
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
        name: 'Himalayan View Stage & Floral Backdrop',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 45000, unit: 'event' },
        deliverables: ['Custom Stage Backdrop with Chandeliers', 'Entry Floral Tunnel (30 ft)', 'Ambient Warm Lighting Setup'],
        leadTimeDays: 5,
      },
      {
        name: 'Pine Valley Fairy Light & Reception Canopy',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 32000, unit: 'event' },
        deliverables: ['5,000 Warm White Fairy Lights Canopy', 'Vintage Lanterns & Edison Bulb Accents', 'Lounge Seating with Cushions'],
        leadTimeDays: 4,
      },
    ],
    capabilities: {
      styles: ['Pahadi Traditional', 'Royal Regal', 'Pastel Boho', 'Rustic Pine', 'Minimalist Elegance'],
      deliverables: ['3D Venue Renders', 'Fresh Mountain Florals', 'Custom Furniture & Drapes', 'Mood Lighting Coordination'],
      teamSize: 10,
      equipment: ['Truss Systems', 'Fairy Light Curtains', 'Crystal Chandeliers', 'Custom Brass Props'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Almora', 'Bharadi', 'Kausani'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Himalayan Ridge Floral Canopy',
        eventType: 'Decoration',
        style: 'Pahadi Traditional',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=300&q=80',
        tags: ['Decor', 'Florals', 'Himalayas'],
      },
    ],
    reviews: [
      {
        customerName: 'Meera & Siddharth Joshi',
        rating: 5,
        reviewText: 'Priya transformed an open hillside in Kapkote into a fairytale venue! Breathtaking setup.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Rahul Arya',
      email: 'decor2@starvnt.com',
      phone: '+91 98222 44444',
    },
    org: {
      businessName: 'Kumaon Floral Arches & Theme Party Decor',
      category: 'Decoration',
      location: 'Main Road, Kapkote, Uttarakhand',
      phone: '+91 98222 44444',
      website: 'https://kumaonfloral.starvnt.com',
      bio: 'Premier birthday decoration studio in Kapkote. Specialized in customized theme setups (Superhero, Jungle Safari, Princess, Cocomelon, Minimalist Pastel), organic balloon arches, and LED numbers.',
      profilePicUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 140 },
      googlePlaceId: 'place_kapkote_theme_decor',
    },
    location: {
      label: 'Kumaon Theme Decor Workshop',
      type: 'STUDIO',
      address: 'Main Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9441, lng: 79.9041 },
    },
    services: [
      {
        name: 'Grand Birthday Theme Backdrop & Organic Balloon Arch',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 15000, unit: 'event' },
        deliverables: ['Custom 3D Character Cutouts & Backdrop (10x8 ft)', '500+ Metallic Organic Balloon Arch', 'LED Number & Name Signage', 'Cake Table Setup with Plinths'],
        leadTimeDays: 2,
      },
      {
        name: 'Minimalist Pastel Birthday Balloon Styling',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 8500, unit: 'event' },
        deliverables: ['Pastel Balloon Garland Arch', 'Custom Vinyl Acrylic Backdrop Sign', 'Table Centerpieces & Streamers'],
        leadTimeDays: 1,
      },
    ],
    capabilities: {
      styles: ['Theme Birthday', 'Organic Balloons', 'Pastel Minimalist', 'Neon LED'],
      deliverables: ['Custom Theme Cutouts', 'Helium Balloons', 'Cake Plinths', 'LED Neon Lights'],
      teamSize: 5,
      equipment: ['Electric Balloon Pumps', 'Metal Backdrop Frames', 'LED Neon Signages'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Bharadi'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Jungle Safari Theme Birthday Setup',
        eventType: 'Birthday',
        style: 'Theme Birthday',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=300&q=80',
        tags: ['Birthday', 'Balloons', 'Theme'],
      },
    ],
    reviews: [
      {
        customerName: 'Deepa Danu',
        rating: 5,
        reviewText: 'Rahul decorated our hall for my son 1st birthday. The jungle theme backdrop and balloon arch looked unreal!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Vikas Shah',
      email: 'decor3@starvnt.com',
      phone: '+91 98222 55555',
    },
    org: {
      businessName: 'Himalayan Fairy Lights & Birthday Decor Studio',
      category: 'Decoration',
      location: 'Near Tehsil, Kapkote, Uttarakhand',
      phone: '+91 98222 55555',
      website: 'https://himalayanfairylights.starvnt.com',
      bio: 'Ambient lighting and lawn decor specialists in Kapkote. Offering outdoor fairy light tunnels, wooden photo booths, birthday entrance gates, and vintage Edison bulb ceiling setups.',
      profilePicUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 92 },
      googlePlaceId: 'place_kapkote_fairy_lights',
    },
    location: {
      label: 'Himalayan Lights Hub',
      type: 'STUDIO',
      address: 'Near Tehsil, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9455, lng: 79.9055 },
    },
    services: [
      {
        name: 'Outdoor Birthday Fairy Light & Entrance Arch Setup',
        category: 'Decoration',
        pricing: { pricingType: 'FIXED', basePrice: 18000, unit: 'event' },
        deliverables: ['3,000 Fairy Lights Tunnel Gate', 'Welcome Signboard with Fresh Flowers', 'Selfie Photo Booth Wall with Props'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Fairy Light Ambient', 'Vintage Edison', 'Photo Booth', 'Lawn Decor'],
      deliverables: ['Fairy Light Tunnels', 'Rustic Props', 'Neon Photo Booth'],
      teamSize: 4,
      equipment: ['Outdoor Fairy Light Chains', 'Wooden Photo Booth Props', 'Dimmer Consoles'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Fairy Light Outdoor Birthday Canopy',
        eventType: 'Birthday',
        style: 'Fairy Light Ambient',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=300&q=80',
        tags: ['Fairy Lights', 'Night Decor', 'Outdoor'],
      },
    ],
    reviews: [
      {
        customerName: 'Nitin Goswami',
        rating: 5,
        reviewText: 'The fairy light entrance tunnel made our evening birthday lawn party magical!',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 4. VENUE (3 Vendors) ──────────────────────────────────────────────────
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
      bio: 'Picturesque valley-facing wedding & party resort featuring 20,000 sq.ft manicured pine lawns, banquet hall, luxury mountain cottages for stay, and scenic panoramic views of Kumaon peaks.',
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
        pricing: { pricingType: 'FIXED', basePrice: 75000, unit: 'event' },
        deliverables: ['Valley-View Open Lawn (500 pax)', 'Covered Banquet Hall (250 pax)', '2 Luxury Family Cottages for stay', '24/7 Silent DG Power Backup & Parking'],
        leadTimeDays: 10,
      },
      {
        name: 'Sunset Terrace & Intimate Party Deck',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 35000, unit: 'event' },
        deliverables: ['Panoramic Mountain Deck for 150 Guests', 'Built-in Bonfire & Bar Lounge', 'Ambient Landscape Lighting', 'Green Rooms'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Himalayan Resort', 'Pine Lawn & Hall', 'Mountain View', 'Party Resort'],
      deliverables: ['Venue Rental (24h)', 'Security & Parking Management', 'Power Backup Generator', 'Dressing Rooms'],
      teamSize: 15,
      equipment: ['Commercial Genset 125kVA', 'CCTV Surveillance', 'Water Supply & Filtration'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Pine Lawn Sunset Celebration',
        eventType: 'Birthday',
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
        reviewText: 'The most scenic venue in Kumaon. Our birthday guests loved the mountain breeze and starry night skies.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Gopal Singh Bora',
      email: 'venue2@starvnt.com',
      phone: '+91 98333 11111',
    },
    org: {
      businessName: 'Kapkote Party Lawn & Celebration Banquet',
      category: 'Venue',
      location: 'Central Market, Kapkote, Uttarakhand',
      phone: '+91 98333 11111',
      website: 'https://kapkotepartyhall.starvnt.com',
      bio: 'Conveniently located party hall and AC banquet in central Kapkote. Perfect for birthday parties, ring ceremonies, and family gatherings with seating for 100-250 guests.',
      profilePicUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 85 },
      googlePlaceId: 'place_kapkote_party_hall',
    },
    location: {
      label: 'Kapkote Banquet Hall',
      type: 'HEAD_OFFICE',
      address: 'Central Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9443, lng: 79.9043 },
    },
    services: [
      {
        name: 'AC Banquet Hall & Birthday Party Space',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 25000, unit: 'event' },
        deliverables: ['Full AC Indoor Hall (200 Pax Capacity)', 'Stage Platform & In-house Sound Speakers', 'Kitchen Setup Area for Catering', 'Power Backup Generator'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['AC Banquet Hall', 'Central Location', 'Indoor Party Space'],
      deliverables: ['Hall Rental (12h)', 'Air Conditioning', 'Basic Lighting & Stage'],
      teamSize: 6,
      equipment: ['Genset 62kVA', 'Central Air Conditioning'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Bharadi'],
      radiusKm: 40,
    },
    portfolio: [
      {
        title: 'AC Banquet Birthday Stage',
        eventType: 'Birthday',
        style: 'AC Banquet Hall',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=300&q=80',
        tags: ['Hall', 'Banquet', 'Party'],
      },
    ],
    reviews: [
      {
        customerName: 'Hema Harbola',
        rating: 5,
        reviewText: 'Spacious hall right in Kapkote town. Clean AC, great lighting, and helpful staff!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Pradeep Joshi',
      email: 'venue3@starvnt.com',
      phone: '+91 98333 22222',
    },
    org: {
      businessName: 'Valley View Garden & Birthday Pavilion',
      category: 'Venue',
      location: 'Shama Road, Kapkote, Uttarakhand',
      phone: '+91 98333 22222',
      website: 'https://valleyviewpavilion.starvnt.com',
      bio: 'Budget open-air party garden and gazebo pavilion overlooking the Sarayu river valley in Kapkote. Ideal for day and evening outdoor birthday celebrations.',
      profilePicUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 64 },
      googlePlaceId: 'place_kapkote_valley_view',
    },
    location: {
      label: 'Valley View Garden',
      type: 'HEAD_OFFICE',
      address: 'Shama Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9458, lng: 79.9058 },
    },
    services: [
      {
        name: 'Valley Lawn & River View Pavilion Rental',
        category: 'Venue',
        pricing: { pricingType: 'FIXED', basePrice: 20000, unit: 'event' },
        deliverables: ['Outdoor Lawn for 150 Guests', 'Covered Gazebo Dining Area', 'River Valley View', 'Ample Parking'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Open Garden Lawn', 'River Valley View', 'Outdoor Party'],
      deliverables: ['Lawn Access (10h)', 'Lighting & Washrooms'],
      teamSize: 4,
      equipment: ['Power Generator 30kVA'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath'],
      radiusKm: 35,
    },
    portfolio: [
      {
        title: 'River View Birthday Lawn',
        eventType: 'Birthday',
        style: 'Open Garden Lawn',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=300&q=80',
        tags: ['Garden', 'Valley View', 'Lawn'],
      },
    ],
    reviews: [
      {
        customerName: 'Kavita Koranga',
        rating: 5,
        reviewText: 'Beautiful river breeze and peaceful environment for our family party!',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 5. SOUND & DJ (3 Vendors) ─────────────────────────────────────────────
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
      bio: 'Concert-grade sound reinforcement, intelligent moving heads, high-energy Bollywood, Punjabi & Pahadi DJ, party lights, and smoke effects across Kapkote.',
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
        pricing: { pricingType: 'FIXED', basePrice: 28000, unit: 'event' },
        deliverables: ['JBL Sound Setup with Dual Subs', '8 Moving Heads & Laser Disco Lights', '4 Wireless Shure Mics', 'Dedicated Sound Engineer'],
        leadTimeDays: 2,
      },
      {
        name: 'Pahadi & Bollywood Party DJ Experience',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 18000, unit: 'event' },
        deliverables: ['Pioneer DJ Console Setup', 'Bollywood, Punjabi & Kumaoni Remix Sets', 'Smoke Machine & Dancefloor Lighting'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Pahadi Dhol & Fusion', 'Bollywood Party', 'Punjabi Hits', 'EDM Party'],
      deliverables: ['Audio Rig', 'Lighting Console Operator', 'Pioneer DJ Gear'],
      teamSize: 4,
      equipment: ['JBL Speakers', 'Pioneer DJ Console', 'Moving Head Lights', 'Shure Mics'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Almora', 'Bharadi'],
      radiusKm: 75,
    },
    portfolio: [
      {
        title: 'Kapkote DJ Dancefloor Setup',
        eventType: 'Birthday',
        style: 'Bollywood Party',
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
        reviewText: 'DJ Kabir had the entire party dancing till late night in Kapkote!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Suresh Chandra',
      email: 'sound2@starvnt.com',
      phone: '+91 98444 11111',
    },
    org: {
      businessName: 'Himalayan Echoes Party DJ & Lighting',
      category: 'Sound',
      location: 'Near Bus Stand, Kapkote, Uttarakhand',
      phone: '+91 98444 11111',
      website: 'https://himalayanechoes.starvnt.com',
      bio: 'Affordable birthday & party sound system provider in Kapkote. High bass speakers, LED party strobe lights, wireless microphones, and custom playlist coordination.',
      profilePicUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 88 },
      googlePlaceId: 'place_kapkote_himalayan_echoes',
    },
    location: {
      label: 'Himalayan Echoes Store',
      type: 'EQUIPMENT_HUB',
      address: 'Near Bus Stand, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9439, lng: 79.9039 },
    },
    services: [
      {
        name: 'Essential Birthday Party Sound & Disco Lights',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 12000, unit: 'event' },
        deliverables: ['2 RCF High-Bass Speakers', 'LED Disco Ball & Strobe Lights', '2 Cordless Mics', 'Laptop Audio Operator'],
        leadTimeDays: 1,
      },
    ],
    capabilities: {
      styles: ['Birthday Party', 'Disco Strobe', 'High Bass'],
      deliverables: ['Compact Sound System', 'Party Lights'],
      teamSize: 2,
      equipment: ['RCF Speakers', 'Strobe Lights', 'Wireless Mics'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Bharadi'],
      radiusKm: 45,
    },
    portfolio: [
      {
        title: 'Birthday Disco Lights & Sound Setup',
        eventType: 'Birthday',
        style: 'Birthday Party',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80',
        tags: ['Sound', 'Party', 'Disco'],
      },
    ],
    reviews: [
      {
        customerName: 'Pankaj Joshi',
        rating: 5,
        reviewText: 'Great sound quality for the price! Setup was ready an hour before our party started.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Mohit Bhandari',
      email: 'sound3@starvnt.com',
      phone: '+91 98444 22222',
    },
    org: {
      businessName: 'Kapkote Concert Sound & Karaoke Setup',
      category: 'Sound',
      location: 'Cinema Road, Kapkote, Uttarakhand',
      phone: '+91 98444 22222',
      website: 'https://kapkotekaraoke.starvnt.com',
      bio: 'Interactive karaoke and party audio setups for birthdays, anniversaries, and family get-togethers in Kapkote. Complete with screen display, 10,000+ songs, and wireless mics.',
      profilePicUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 54 },
      googlePlaceId: 'place_kapkote_karaoke',
    },
    location: {
      label: 'Kapkote Audio Lab',
      type: 'EQUIPMENT_HUB',
      address: 'Cinema Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9451, lng: 79.9051 },
    },
    services: [
      {
        name: 'Interactive Birthday Karaoke & Audio Station',
        category: 'Sound',
        pricing: { pricingType: 'FIXED', basePrice: 15000, unit: 'event' },
        deliverables: ['55-inch LED TV Screen for Lyrics', '4 Wireless Mics', 'Yamaha Active Sound Rig', '10,000+ Hindi, English & Kumaoni Songs'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Karaoke', 'Family Fun', 'Interactive Music'],
      deliverables: ['TV Screen Karaoke Setup', 'Sound System'],
      teamSize: 2,
      equipment: ['Yamaha Active Speakers', 'LED Screen', 'Wireless Mics'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Karaoke Singing Night at Birthday Event',
        eventType: 'Birthday',
        style: 'Karaoke',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
        tags: ['Karaoke', 'Singing', 'Party'],
      },
    ],
    reviews: [
      {
        customerName: 'Sunita Mehra',
        rating: 5,
        reviewText: 'The karaoke setup was so much fun! All uncle-aunties and kids sang their favorite tracks.',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 6. MAKEUP & STYLING (3 Vendors) ───────────────────────────────────────
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
      bio: 'Specialist party & bridal makeover artist celebrating traditional Pahadi elegance with modern HD Airbrush long-lasting formulas designed for mountain weather.',
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
        name: 'Signature HD Party Makeover & Hair Styling',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 12000, unit: 'event' },
        deliverables: ['HD Airbrush Long-Wear Finish', 'Textured Braid or Hollywood Waves', 'Lashes & Highlighting'],
        leadTimeDays: 3,
      },
    ],
    capabilities: {
      styles: ['HD Airbrush', 'Dewy Minimalist', 'Royal Glamour'],
      deliverables: ['On-Location Service', 'Hair Styling'],
      teamSize: 3,
      equipment: ['Temptu Pro Airbrush', 'Dyson Airwrap', 'MAC Professional Kits'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora', 'Bharadi'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Party Dewy Glow Look',
        eventType: 'Birthday',
        style: 'Dewy Minimalist',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        tags: ['Makeup', 'Party', 'Glow'],
      },
    ],
    reviews: [
      {
        customerName: 'Shreya Upadhyay',
        rating: 5,
        reviewText: 'Natasha created a stunning look for my birthday party in Kapkote. Stayed flawless all night!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Meenakshi Bhatt',
      email: 'makeup2@starvnt.com',
      phone: '+91 98555 11111',
    },
    org: {
      businessName: 'Glamour Peaks Makeup & Party Styling',
      category: 'Makeup',
      location: 'Main Market, Kapkote, Uttarakhand',
      phone: '+91 98555 11111',
      website: 'https://glamourpeaks.starvnt.com',
      bio: 'Popular birthday & event makeup artist in Kapkote. Offering trendy glam looks, soft pastel eyeshadows, hair curling, and mother-daughter duo combo styling.',
      profilePicUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 76 },
      googlePlaceId: 'place_kapkote_glamour_peaks',
    },
    location: {
      label: 'Glamour Lounge Kapkote',
      type: 'STUDIO',
      address: 'Main Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9446, lng: 79.9046 },
    },
    services: [
      {
        name: 'Birthday Glam Makeup & Hair Extension Styling',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 7500, unit: 'event' },
        deliverables: ['Soft Glam HD Foundation', 'Curl & Volume Hair Styling', 'Lashes & Lip Glossing'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Soft Glam', 'Trendy Party Look', 'Hair Styling'],
      deliverables: ['Studio or Home Visit', 'Duo Discounts'],
      teamSize: 2,
      equipment: ['Huda Beauty Kits', 'Ikonic Hair Curlers'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Birthday Soft Glam Makeover',
        eventType: 'Birthday',
        style: 'Soft Glam',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
        tags: ['Makeup', 'Glam', 'Styling'],
      },
    ],
    reviews: [
      {
        customerName: 'Ankita Verma',
        rating: 5,
        reviewText: 'Meenakshi did my birthday makeup in Kapkote. Soft, natural, and very quick!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Pooja Rautela',
      email: 'makeup3@starvnt.com',
      phone: '+91 98555 22222',
    },
    org: {
      businessName: 'Kumaon Beauty & Birthday Makeover Lounge',
      category: 'Makeup',
      location: 'Tehsil Road, Kapkote, Uttarakhand',
      phone: '+91 98555 22222',
      website: 'https://kumaonbeautylounge.starvnt.com',
      bio: 'Budget-friendly party makeup and hair salon in Kapkote for birthday hosts, family members, and kids styling.',
      profilePicUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.6, count: 50 },
      googlePlaceId: 'place_kapkote_beauty_lounge',
    },
    location: {
      label: 'Kapkote Beauty Lounge',
      type: 'STUDIO',
      address: 'Tehsil Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9453, lng: 79.9053 },
    },
    services: [
      {
        name: 'Express Party Makeup & Blowdry',
        category: 'Makeup',
        pricing: { pricingType: 'FIXED', basePrice: 4500, unit: 'event' },
        deliverables: ['Natural Glow Makeup Base', 'Professional Blowdry & Straightening', 'Lipstick & Bindi Setting'],
        leadTimeDays: 1,
      },
    ],
    capabilities: {
      styles: ['Express Party', 'Natural Glow', 'Blowdry'],
      deliverables: ['In-Salon Service', 'Quick Turnaround'],
      teamSize: 2,
      equipment: ['Maybelline & L’Oreal Kits', 'Philips Dryers'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Bharadi'],
      radiusKm: 35,
    },
    portfolio: [
      {
        title: 'Natural Birthday Glow Look',
        eventType: 'Birthday',
        style: 'Natural Glow',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
        tags: ['Makeup', 'Party'],
      },
    ],
    reviews: [
      {
        customerName: 'Neema Pandey',
        rating: 5,
        reviewText: 'Very affordable and neat work. Got ready for my sister birthday in 45 mins!',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 7. ENTERTAINMENT (3 Vendors) ──────────────────────────────────────────
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
      bio: 'Soulful live band fusing traditional Uttarakhand folk instruments (Ransingha, Dhol Damau, Hurka, Flute) with modern acoustic rock and Bollywood party hits.',
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
        name: 'Traditional Pahadi Folk & Bollywood Fusion (2 Hours Live)',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 28000, unit: 'event' },
        deliverables: ['Vocalists, Flutist, Dhol Damau & Keyboard Player', '2 Hours Live Performance', 'All Stage Mics Included'],
        leadTimeDays: 5,
      },
    ],
    capabilities: {
      styles: ['Kumaoni Folk Fusion', 'Bollywood Acoustic', 'Chholiya Welcome'],
      deliverables: ['Live Band', 'Sound Sync'],
      teamSize: 5,
      equipment: ['Acoustic Guitars', 'Keyboard', 'Pahadi Percussion'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora'],
      radiusKm: 80,
    },
    portfolio: [
      {
        title: 'High Mountain Valley Live Concert',
        eventType: 'Birthday',
        style: 'Kumaoni Folk Fusion',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
        tags: ['Live Band', 'Folk'],
      },
    ],
    reviews: [
      {
        customerName: 'Devika Pandey',
        rating: 5,
        reviewText: 'The live folk fusion performance made our Kapkote party unforgettable!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Sunil Kumar (Jadugar)',
      email: 'entertainment2@starvnt.com',
      phone: '+91 98666 11111',
    },
    org: {
      businessName: 'Himalayan Magic, Puppet & Kids Fun Crew',
      category: 'Entertainment',
      location: 'Station Road, Kapkote, Uttarakhand',
      phone: '+91 98666 11111',
      website: 'https://himalayanmagic.starvnt.com',
      bio: 'Complete kids birthday entertainment crew in Kapkote! Featuring interactive illusion magic shows, traditional Kumaoni puppet theatre, Mickey/Minions mascot dancers, and tattoo/balloon twisting artists.',
      profilePicUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 120 },
      googlePlaceId: 'place_kapkote_magic_fun',
    },
    location: {
      label: 'Magic Crew Office',
      type: 'STUDIO',
      address: 'Station Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9444, lng: 79.9044 },
    },
    services: [
      {
        name: 'Ultimate Kids Birthday Entertainment Package',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 16000, unit: 'event' },
        deliverables: ['45-min Interactive Stage Illusion Magic Show', 'Live Puppet Show (Rajasthani & Kumaoni Folk Tales)', '1 Mascot Dancer (Mickey / Minion)', 'Airbrush Tattoo & Balloon Twisting Station (2 Hours)'],
        leadTimeDays: 2,
      },
      {
        name: 'Interactive Magic Show & Balloon Twisting',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 9500, unit: 'event' },
        deliverables: ['45-min Comedy Magic Show', 'Balloon Animal Twisting for all Children'],
        leadTimeDays: 1,
      },
    ],
    capabilities: {
      styles: ['Stage Magic Show', 'Puppet Theatre', 'Mascot Dancers', 'Tattoo Art'],
      deliverables: ['Illusion Tricks', 'Custom Kids Games', 'Balloon Sculptures'],
      teamSize: 4,
      equipment: ['Stage Magic Props', 'Sound System with Headset Mic', 'Puppet Theatre Stage'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Bharadi'],
      radiusKm: 60,
    },
    portfolio: [
      {
        title: 'Kids Magic & Puppet Show at Kapkote Birthday',
        eventType: 'Birthday',
        style: 'Stage Magic Show',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=300&q=80',
        tags: ['Magic Show', 'Kids', 'Birthday'],
      },
    ],
    reviews: [
      {
        customerName: 'Aarti Karki',
        rating: 5,
        reviewText: 'Jadugar Sunil had all 30 children gasping and laughing throughout the magic show! Highly recommended for kids birthdays.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Rohit Joshi',
      email: 'entertainment3@starvnt.com',
      phone: '+91 98666 22222',
    },
    org: {
      businessName: 'Kapkote Acoustic Live Band & Singers',
      category: 'Entertainment',
      location: 'Main Market, Kapkote, Uttarakhand',
      phone: '+91 98666 22222',
      website: 'https://kapkoteacoustic.starvnt.com',
      bio: 'Charming 3-piece acoustic band (Vocalist, Guitarist & Percussionist) playing classic Bollywood unplugged, Pahadi melodies, and custom birthday dedication songs.',
      profilePicUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 68 },
      googlePlaceId: 'place_kapkote_acoustic_band',
    },
    location: {
      label: 'Acoustic Studio',
      type: 'STUDIO',
      address: 'Main Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9447, lng: 79.9047 },
    },
    services: [
      {
        name: 'Acoustic Bollywood & Birthday Song Dedications (2 Hours)',
        category: 'Entertainment',
        pricing: { pricingType: 'FIXED', basePrice: 15000, unit: 'event' },
        deliverables: ['Acoustic Guitarist, Singer & Cajon Player', '2 Hours Unplugged Performance', 'Portable Bose Sound System'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Acoustic Unplugged', 'Bollywood Classics', 'Birthday Dedications'],
      deliverables: ['Live Acoustic Trio', 'Bose Sound Rig'],
      teamSize: 3,
      equipment: ['Taylor Acoustic Guitars', 'Cajon', 'Bose L1 System'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Unplugged Birthday Night Performance',
        eventType: 'Birthday',
        style: 'Acoustic Unplugged',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300&q=80',
        tags: ['Acoustic', 'Live Music', 'Birthday'],
      },
    ],
    reviews: [
      {
        customerName: 'Bhaskar Shah',
        rating: 5,
        reviewText: 'Wonderful acoustic session for my father 50th birthday dinner in Kapkote.',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 8. ANCHOR / EMCEE (3 Vendors) ─────────────────────────────────────────
  {
    owner: {
      fullName: 'Aakash Sharma',
      email: 'anchor1@starvnt.com',
      phone: '+91 98888 11111',
    },
    org: {
      businessName: 'Delhi & Kumaon Emcee Desk (Master of Ceremonies)',
      category: 'Anchor',
      location: 'Central Market, Kapkote, Bageshwar, Uttarakhand',
      phone: '+91 98888 11111',
      website: 'https://emceedesk.starvnt.com',
      bio: 'High-energy professional event anchor & emcee with 8+ years hosting corporate events, grand birthday galas, and Pahadi celebrations across Delhi, Kapkote, and Almora. Fluent in Hindi, English & Kumaoni.',
      profilePicUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.9, count: 150 },
      googlePlaceId: 'place_kapkote_emcee_desk',
    },
    location: {
      label: 'Kapkote Emcee Desk Studio',
      type: 'STUDIO',
      address: 'Central Market, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9442, lng: 79.9042 },
    },
    services: [
      {
        name: 'Grand Birthday & Gala Event Anchoring (4 Hours)',
        category: 'Anchor',
        pricing: { pricingType: 'FIXED', basePrice: 22000, unit: 'event' },
        deliverables: ['Professional Emcee / Host for 4 Hours', 'Bilingual Script Coordination & Stage Games', 'Cake Cutting Ceremony Coordination', 'Interactive Guest Engagement'],
        leadTimeDays: 2,
      },
      {
        name: 'Kids Birthday Party Games Host & Emcee (2 Hours)',
        category: 'Anchor',
        pricing: { pricingType: 'FIXED', basePrice: 12000, unit: 'event' },
        deliverables: ['Interactive Kids Party Games Coordination', 'Music & Stage Sync', 'Gift Distribution Hosting'],
        leadTimeDays: 1,
      },
    ],
    capabilities: {
      styles: ['Professional Anchor', 'High-Energy Emcee', 'Bilingual Script', 'Kids Game Coordinator'],
      deliverables: ['Script Planning', 'Rehearsal Call', 'Stage Engagement', 'Game Props'],
      teamSize: 2,
      equipment: ['Wireless Sennheiser Mic', 'Custom Game Props & Scoreboard'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Almora', 'Bharadi', 'Kausani', 'Haldwani'],
      radiusKm: 80,
    },
    portfolio: [
      {
        title: 'Grand Birthday Stage Anchoring in Kapkote',
        eventType: 'Birthday',
        style: 'High-Energy Emcee',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
        tags: ['Anchor', 'Emcee', 'Stage'],
      },
    ],
    reviews: [
      {
        customerName: 'Pooja & Rajesh Sengupta',
        rating: 5,
        reviewText: 'Aakash kept our entire 200 birthday guests entertained from start to finish! Brilliant games and stage presence.',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Pooja Bhandari',
      email: 'anchor2@starvnt.com',
      phone: '+91 98888 22222',
    },
    org: {
      businessName: 'Pahadi Celebrations Birthday Host & Anchor',
      category: 'Anchor',
      location: 'Upper Bazar, Kapkote, Uttarakhand',
      phone: '+91 98888 22222',
      website: 'https://pahadihost.starvnt.com',
      bio: 'Witty, vibrant local Pahadi emcee in Kapkote specializing in birthday party game hosting, family milestone celebrations, and traditional Kumaoni cultural anchoring.',
      profilePicUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.8, count: 86 },
      googlePlaceId: 'place_kapkote_pahadi_host',
    },
    location: {
      label: 'Kapkote Host Desk',
      type: 'STUDIO',
      address: 'Upper Bazar, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9449, lng: 79.9049 },
    },
    services: [
      {
        name: 'Family Birthday Party Host & Game Anchor',
        category: 'Anchor',
        pricing: { pricingType: 'FIXED', basePrice: 14000, unit: 'event' },
        deliverables: ['3 Hours Interactive Hosting', 'Traditional Kumaoni & Hindi Puns & Humour', 'Custom Family Quiz & Games'],
        leadTimeDays: 2,
      },
    ],
    capabilities: {
      styles: ['Local Pahadi Humour', 'Family Anchor', 'Interactive Games'],
      deliverables: ['Custom Quiz', 'Stage Hosting'],
      teamSize: 1,
      equipment: ['Wireless Microphone'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Bharadi'],
      radiusKm: 50,
    },
    portfolio: [
      {
        title: 'Family Birthday Party Quiz & Hosting',
        eventType: 'Birthday',
        style: 'Local Pahadi Humour',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        tags: ['Anchor', 'Host', 'Party'],
      },
    ],
    reviews: [
      {
        customerName: 'Ganesh Koranga',
        rating: 5,
        reviewText: 'Pooja brought so much joy and laughter to my father 60th birthday celebration in Kapkote!',
        wouldRecommend: true,
      },
    ],
  },
  {
    owner: {
      fullName: 'Kamlesh Bisht',
      email: 'anchor3@starvnt.com',
      phone: '+91 98888 33333',
    },
    org: {
      businessName: 'Himalayan Stage Anchors & Game Coordinators',
      category: 'Anchor',
      location: 'Station Road, Kapkote, Uttarakhand',
      phone: '+91 98888 33333',
      website: 'https://himalayanstage.starvnt.com',
      bio: 'Budget event anchors and game coordinators for kids birthdays, school functions, and small family parties in Kapkote.',
      profilePicUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      rating: { average: 4.7, count: 60 },
      googlePlaceId: 'place_kapkote_stage_anchors',
    },
    location: {
      label: 'Stage Anchors Office',
      type: 'STUDIO',
      address: 'Station Road, Kapkote',
      locality: 'Kapkote',
      city: 'Kapkote',
      state: 'Uttarakhand',
      postalCode: '263632',
      coordinates: { lat: 29.9454, lng: 79.9054 },
    },
    services: [
      {
        name: 'Essential Party Emcee & Game Coordination',
        category: 'Anchor',
        pricing: { pricingType: 'FIXED', basePrice: 9500, unit: 'event' },
        deliverables: ['2 Hours Stage Anchoring', 'Kids Musical Chairs & Pass the Parcel Coordination', 'Cake Cutting Announcement'],
        leadTimeDays: 1,
      },
    ],
    capabilities: {
      styles: ['Budget Emcee', 'Kids Games', 'Punctual Host'],
      deliverables: ['Party Game Hosting'],
      teamSize: 1,
      equipment: ['Microphone'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath'],
      radiusKm: 40,
    },
    portfolio: [
      {
        title: 'Kids Party Musical Chairs Hosting',
        eventType: 'Birthday',
        style: 'Kids Games',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
        tags: ['Anchor', 'Games', 'Kids'],
      },
    ],
    reviews: [
      {
        customerName: 'Lalit Singh',
        rating: 5,
        reviewText: 'Punctual, friendly, and managed all the kids games smoothly.',
        wouldRecommend: true,
      },
    ],
  },

  // ─── 9. EVENT PLANNING (1 Vendor) ──────────────────────────────────────────
  {
    owner: {
      fullName: 'Tanya & Rohan Mehta',
      email: 'planner@starvnt.com',
      phone: '+91 98777 89012',
    },
    org: {
      businessName: 'Devbhoomi Vows Wedding & Event Planning',
      category: 'Event Planning',
      location: 'Upper Market, Kapkote, Bageshwar, Uttarakhand',
      phone: '+91 98777 89012',
      website: 'https://devbhoomivows.starvnt.com',
      bio: 'Destination wedding & birthday party planners specializing in mountain ceremonies across Kapkote, Bageshwar, Kausani, and Almora. Complete logistics, vendor synchronization, and event execution.',
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
        name: '360° Himalayan Event Planning & Production',
        category: 'Event Planning',
        pricing: { pricingType: 'FIXED', basePrice: 45000, unit: 'event' },
        deliverables: ['Complete Vendor Contracts & Timing Management', 'Local Permission & Power Backup Safeguards', 'On-Ground Shadow Coordinators'],
        leadTimeDays: 10,
      },
    ],
    capabilities: {
      styles: ['Destination Event', 'Himalayan Ridge', 'Pahadi Rituals'],
      deliverables: ['Logistics Plan', 'Vendor Sync Meetings'],
      teamSize: 8,
      equipment: ['Walkie-Talkie Set', 'Run-of-Show Digital Tablets'],
    },
    coverage: {
      city: 'Kapkote',
      localities: ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Almora', 'Kausani', 'Nainital', 'Haldwani'],
      radiusKm: 100,
    },
    portfolio: [
      {
        title: 'Himalayan Event Coordination',
        eventType: 'Birthday',
        style: 'Destination Event',
        mediaType: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=300&q=80',
        tags: ['Planning', 'Himalayas'],
      },
    ],
    reviews: [
      {
        customerName: 'Kunal & Aanya Merchant',
        rating: 5,
        reviewText: 'Tanya & Rohan made our Kapkote event completely effortless!',
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

  // Clear demo listings so only real vendors appear in catalog
  await DemoListing.deleteMany({});
  console.log('[seed] Cleared demo listings from database.');

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

  console.log(`\n[seed] Seeding ${REAL_VENDORS.length} realistic vendors for Kapkote...`);

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
      { vendor: org._id },
      {
        vendor: org._id,
        label: vData.location.label,
        type: vData.location.type || 'STUDIO',
        address: vData.location.address,
        locality: vData.location.locality,
        city: vData.location.city,
        state: vData.location.state,
        postalCode: vData.location.postalCode,
        coordinates: vData.location.coordinates,
        isPrimary: true,
      },
      { upsert: true, new: true }
    );

    // 4. Services
    await VendorService.deleteMany({ vendor: org._id });
    const createdServices = [];
    for (const s of vData.services) {
      const svc = await VendorService.findOneAndUpdate(
        { vendor: org._id, name: s.name },
        {
          vendor: org._id,
          name: s.name,
          category: s.category,
          pricing: s.pricing,
          deliverables: s.deliverables,
          leadTimeDays: s.leadTimeDays,
          status: 'ACTIVE',
        },
        { upsert: true, new: true }
      );
      createdServices.push(svc);
    }

    const primaryService = createdServices[0];

    // 5. Capability
    if (vData.capabilities) {
      await VendorCapability.findOneAndUpdate(
        { vendor: org._id },
        {
          vendor: org._id,
          category: vData.org.category,
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
            eventType: p.eventType || 'Birthday',
            style: p.style || 'Candid',
            location: {
              venue: 'Celebration Venue',
              locality: vData.location.locality,
              city: vData.location.city,
            },
            tags: p.tags || ['Birthday', 'Celebration'],
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
            eventType: 'Birthday',
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
          message: `Birthday Celebration · ${vData.location.city} · View requirements`,
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
            address: 'Main Market Road, Kapkote',
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
          address: 'Main Market Road, Kapkote',
          locality: vData.location.locality,
          city: vData.location.city,
          state: 'Uttarakhand',
        },
        guestCount: 150,
        requiredCapability: `Verified requirements for ${vData.org.category}`,
        estimatedTravel: '3 km',
        travelCost: 300,
        status: 'NEW',
        action: 'Prepare Quote',
      });
    }

    await CoreBooking.updateMany(
      { vendorId: org._id },
      {
        $set: {
          serviceLocation: {
            address: 'Main Market Road, Kapkote',
            locality: vData.location.locality,
            city: vData.location.city,
            state: 'Uttarakhand',
          },
        },
      }
    );
    // Dummy booking seeding disabled to ensure clean customer bookings workspace

    await Quote.updateMany(
      { vendor: org._id },
      {
        $set: {
          serviceLocation: {
            address: 'Main Market Road, Kapkote',
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
  console.log('✓ 24 REAL KAPKOTE VENDORS SEEDED SUCCESSFULLY! ALL ACCOUNTS USE PASSWORD:');
  console.log(`  PASSWORD: ${COMMON_PASSWORD}`);
  console.log('========================================================================');
  console.log('  Role      | Email                  | Business / Owner (Category)');
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
