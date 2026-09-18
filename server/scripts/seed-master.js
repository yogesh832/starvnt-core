import { connectDB, disconnectDB } from '../src/db/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { VendorCapability } from '../src/external/models/VendorCapability.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { TravelPolicy } from '../src/external/models/TravelPolicy.js';
import { Opportunity } from '../src/external/models/Opportunity.js';
import { Quote } from '../src/external/models/Quote.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { Notification } from '../src/external/models/Notification.js';
import { AdminUser } from '../src/admin/models/AdminUser.js';
import { CoreBooking } from '../src/admin/models/CoreBooking.js';
import { hashPassword } from '../src/external/utils/password.js';

async function seedMaster() {
  console.log('[seed] Connecting to databases...');
  await connectDB();

  const defaultPasswordHash = await hashPassword('Password123');
  const adminPasswordHash = await hashPassword('AdminPass123!');

  // 1. Seed Super Admin
  let admin = await AdminUser.findOne({ email: 'admin@starvnt.com' });
  if (!admin) {
    admin = await AdminUser.create({
      fullName: 'Chief Systems Architect',
      email: 'admin@starvnt.com',
      passwordHash: adminPasswordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
    console.log(`[seed] Created Super Admin: ${admin.email}`);
  }

  // 2. Seed Customer
  let customer = await ExternalUser.findOne({ email: 'customer@starvnt.com' });
  if (!customer) {
    customer = await ExternalUser.create({
      fullName: 'Ananya Roy',
      email: 'customer@starvnt.com',
      passwordHash: defaultPasswordHash,
      phone: '+91 98300 12345',
      accountType: 'CUSTOMER',
      status: 'ACTIVE',
    });
    console.log(`[seed] Created Customer: ${customer.email}`);
  }

  // 3. Seed Primary Vendor (Premium Moments)
  let vendorUser = await ExternalUser.findOne({ email: 'vendor@starvnt.com' });
  if (!vendorUser) {
    vendorUser = await ExternalUser.create({
      fullName: 'Arun Photographer',
      email: 'vendor@starvnt.com',
      passwordHash: defaultPasswordHash,
      phone: '+91 98765 43210',
      accountType: 'VENDOR',
      status: 'ACTIVE',
    });
    console.log(`[seed] Created Vendor User: ${vendorUser.email}`);
  }

  let vendorOrg = await VendorOrganization.findOne({ owner: vendorUser._id });
  if (!vendorOrg) {
    vendorOrg = await VendorOrganization.create({
      businessName: 'Premium Moments',
      category: 'Photography',
      location: 'Kolkata, West Bengal',
      owner: vendorUser._id,
      status: 'ACTIVE',
      activationState: 'ACTIVE',
      isCommerciallyActive: true,
      verification: { isVerified: true, verifiedAt: new Date() },
      rating: { average: 4.9, count: 142 },
    });
    console.log(`[seed] Created VendorOrganization: ${vendorOrg.businessName}`);
  } else {
    vendorOrg.activationState = 'ACTIVE';
    vendorOrg.isCommerciallyActive = true;
    vendorOrg.verification = { isVerified: true, verifiedAt: new Date() };
    await vendorOrg.save();
  }

  vendorUser.vendorOrganization = vendorOrg._id;
  await vendorUser.save();

  // 4. Seed Services & Capabilities
  let service = await VendorService.findOne({ vendor: vendorOrg._id, name: 'Wedding Photography & Cinematic Video' });
  if (!service) {
    service = await VendorService.create({
      vendor: vendorOrg._id,
      name: 'Wedding Photography & Cinematic Video',
      category: 'Photography',
      pricing: { pricingType: 'FIXED', basePrice: 48000, unit: 'event' },
      deliverables: ['1 High-Res Album', 'Raw Photos', '3-min Teaser Film', 'Full Event Video'],
      leadTimeDays: 7,
      status: 'ACTIVE',
    });
    console.log(`[seed] Created VendorService: ${service.name}`);
  }

  await VendorCapability.findOneAndUpdate(
    { vendor: vendorOrg._id, vendorService: service._id },
    {
      vendor: vendorOrg._id,
      vendorService: service._id,
      styles: ['Candid', 'Traditional', 'Cinematic', 'Aerial/Drone'],
      deliverables: ['Edited Photos', 'Teaser Film', 'Drone Shots'],
      teamSize: 2,
      equipment: ['Sony A7IV', 'DJI Ronin RS3', 'DJI Mini 3 Pro Drone'],
    },
    { upsert: true, new: true }
  );

  await ServiceCoverage.findOneAndUpdate(
    { vendor: vendorOrg._id, vendorService: service._id },
    {
      vendor: vendorOrg._id,
      vendorService: service._id,
      coverageType: 'CITY',
      city: 'Kolkata',
      localities: ['New Town', 'Salt Lake', 'Rajarhat', 'Park Street', 'Alipore'],
      radiusKm: 50,
      confidence: 'VERIFIED',
    },
    { upsert: true, new: true }
  );

  await TravelPolicy.findOneAndUpdate(
    { vendor: vendorOrg._id },
    {
      vendor: vendorOrg._id,
      origin: { locality: 'Barasat', city: 'Kolkata', coordinates: { lat: 22.72, lng: 88.48 } },
      freeRadiusKm: 10,
      ratePerKm: 25,
      flatRates: [{ targetArea: 'New Town', flatFee: 2000 }, { targetArea: 'Salt Lake', flatFee: 1500 }],
    },
    { upsert: true, new: true }
  );

  // 5. Seed Pre-qualified Opportunities
  const oppCount = await Opportunity.countDocuments({ vendor: vendorOrg._id });
  if (oppCount === 0) {
    await Opportunity.create([
      {
        vendor: vendorOrg._id,
        customer: customer._id,
        vendorService: service._id,
        serviceName: 'Wedding Photography',
        eventDate: '2026-11-26',
        serviceLocation: { address: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
        guestCount: 500,
        requiredCapability: '2 photographers · Candid + Traditional · Full day',
        estimatedTravel: 'Barasat -> New Town (18 km)',
        travelCost: 2000,
        status: 'NEW',
        action: 'Respond / Quote',
      },
      {
        vendor: vendorOrg._id,
        customer: customer._id,
        vendorService: service._id,
        serviceName: 'Pre-wedding Shoot',
        eventDate: '2026-12-14',
        serviceLocation: { address: 'Eco Park', locality: 'New Town', city: 'Kolkata' },
        guestCount: 2,
        requiredCapability: '1 photographer · Candid · 4 hours Outdoor',
        estimatedTravel: 'Barasat -> New Town (16 km)',
        travelCost: 800,
        status: 'VIEWED',
        action: 'Prepare Quote',
      },
    ]);
    console.log('[seed] Created sample pre-qualified Opportunities');
  }

  // 6. Seed Authoritative Core Bookings
  const bookingCount = await CoreBooking.countDocuments({ vendorId: vendorOrg._id });
  if (bookingCount === 0) {
    await CoreBooking.create([
      {
        bookingReference: 'BK-2210',
        vendorId: vendorOrg._id,
        vendorName: 'Premium Moments',
        customerId: customer._id,
        customerName: 'Ananya Roy',
        serviceName: 'Wedding Photography & Cinematic Video',
        category: 'Photography',
        eventDate: '2026-11-26',
        serviceLocation: { address: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
        totalAmount: 50000,
        pricing: { basePrice: 48000, travelFee: 2000, totalAmount: 50000 },
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'PAYMENT_VERIFIED',
        executionStatus: 'SERVICE_SCHEDULED',
        settlementStatus: 'NOT_ELIGIBLE',
      },
      {
        bookingReference: 'BK-2214',
        vendorId: vendorOrg._id,
        vendorName: 'Premium Moments',
        customerId: customer._id,
        customerName: 'Mehta Corporate',
        serviceName: 'Corporate Event Coverage',
        category: 'Photography',
        eventDate: '2027-01-10',
        serviceLocation: { address: 'ITC Royal Bengal', locality: 'EM Bypass', city: 'Kolkata' },
        totalAmount: 52000,
        pricing: { basePrice: 50000, travelFee: 2000, totalAmount: 52000 },
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'PAYMENT_VERIFIED',
        executionStatus: 'SERVICE_STARTED',
        settlementStatus: 'NOT_ELIGIBLE',
      },
    ]);
    console.log('[seed] Created sample Core Bookings');
  }

  // 7. Seed Bulk Portfolio Media (Spec §7, Golden Test M)
  const portfolioCount = await PortfolioItem.countDocuments({ vendor: vendorOrg._id });
  if (portfolioCount < 20) {
    const portfolioBatch = [];
    for (let i = 1; i <= 52; i++) {
      portfolioBatch.push({
        vendor: vendorOrg._id,
        vendorService: service._id,
        mediaType: 'IMAGE',
        url: `https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=600&q=80&sig=${i}`,
        thumbnailUrl: `https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=300&q=80&sig=${i}`,
        originalFilename: `wedding_candid_${i}.jpg`,
        title: `Kisan Palace Celebration #${i}`,
        eventType: 'Wedding',
        style: i % 2 === 0 ? 'Candid' : 'Traditional',
        location: { venue: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
        tags: ['Wedding', 'Kisan Palace', 'Candid', '4K'],
        status: 'PUBLISHED',
      });
    }
    portfolioBatch.push(
      {
        vendor: vendorOrg._id,
        vendorService: service._id,
        mediaType: 'REEL',
        url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
        originalFilename: 'insta_teaser.mp4',
        durationSeconds: 45,
        title: 'Instagram 45s Highlight Reel',
        eventType: 'Wedding',
        style: 'Cinematic',
        location: { venue: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
        tags: ['Reel', 'Highlight', 'Wedding'],
        status: 'PUBLISHED',
      },
      {
        vendor: vendorOrg._id,
        vendorService: service._id,
        mediaType: 'HIGHLIGHT_FILM',
        url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
        originalFilename: 'cinematic_teaser.mov',
        durationSeconds: 150,
        title: 'Cinematic Teaser Film',
        eventType: 'Wedding',
        style: 'Cinematic',
        location: { venue: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
        tags: ['Cinematic', 'Drone', 'Teaser'],
        status: 'PUBLISHED',
      }
    );

    await PortfolioItem.insertMany(portfolioBatch);
    console.log(`[seed] Created ${portfolioBatch.length} bulk portfolio items`);
  }

  // 8. Seed Operational Notifications (matching design reference)
  const notifCount = await Notification.countDocuments({ vendor: vendorOrg._id });
  if (notifCount === 0) {
    await Notification.create([
      {
        vendor: vendorOrg._id,
        title: 'New enquiry received',
        message: 'Wedding Photography · 26 Nov (Kisan Palace)',
        type: 'ENQUIRY',
        link: '/vendor/enquiries',
        isRead: false,
      },
      {
        vendor: vendorOrg._id,
        title: 'Client approved your quote',
        message: 'Mehta Corporate Event · ₹52,000',
        type: 'QUOTE',
        link: '/vendor/quotes',
        isRead: false,
      },
      {
        vendor: vendorOrg._id,
        title: 'Payment received',
        message: '₹25,000 advance · Riya & Arjun',
        type: 'PAYMENT',
        link: '/vendor/bookings',
        isRead: false,
      },
      {
        vendor: vendorOrg._id,
        title: 'Booking reminder',
        message: 'Tomorrow at 10:00 AM · Client Meeting',
        type: 'BOOKING',
        link: '/vendor/calendar',
        isRead: false,
      },
    ]);
    console.log('[seed] Created sample live Notifications');
  }

  // 9. Seed Quotes
  const quotesCount = await Quote.countDocuments({ vendor: vendorOrg._id });
  if (quotesCount === 0) {
    await Quote.create([
      {
        quoteReference: 'QT-1042-991',
        vendor: vendorOrg._id,
        customer: customer._id,
        vendorService: service._id,
        serviceName: 'Wedding Photography',
        eventDate: '2026-11-26',
        serviceLocation: { address: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
        pricingBreakdown: { basePrice: 46000, travelFee: 2000, totalAmount: 48000 },
        status: 'SUBMITTED',
        notes: 'Full day candid & traditional coverage with 2 photographers',
      },
      {
        quoteReference: 'QT-1039-882',
        vendor: vendorOrg._id,
        customer: customer._id,
        vendorService: service._id,
        serviceName: 'Corporate Event Coverage',
        eventDate: '2027-01-10',
        serviceLocation: { address: 'ITC Royal Bengal', locality: 'EM Bypass', city: 'Kolkata' },
        pricingBreakdown: { basePrice: 50000, travelFee: 2000, totalAmount: 52000 },
        status: 'DRAFT',
        notes: 'Half day conference and executive portraits',
      },
    ]);
    console.log('[seed] Created sample Quotes');
  }

  console.log('\n======================================================');
  console.log('✓ Master Seed Execution Complete!');
  console.log('------------------------------------------------------');
  console.log('  Admin Portal:      admin@starvnt.com    / AdminPass123!');
  console.log('  Vendor OS:         vendor@starvnt.com   / Password123');
  console.log('  Customer App:      customer@starvnt.com / Password123');
  console.log('======================================================\n');

  await disconnectDB();
}

seedMaster().catch((err) => {
  console.error('[seed] Master seed failed:', err.message);
  process.exit(1);
});
