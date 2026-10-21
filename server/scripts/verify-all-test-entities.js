import { connectDB, disconnectDB } from '../src/db/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { VendorService } from '../src/external/models/VendorService.js';
import { OperatingLocation } from '../src/external/models/OperatingLocation.js';
import { ServiceCoverage } from '../src/external/models/ServiceCoverage.js';
import { PortfolioItem } from '../src/external/models/PortfolioItem.js';
import { TravelPolicy } from '../src/external/models/TravelPolicy.js';

async function verifyAll() {
  console.log('[verify] Connecting to database...');
  await connectDB();

  // 1. Activate & Verify all External Users
  const userResult = await ExternalUser.updateMany(
    {},
    {
      $set: {
        status: 'ACTIVE',
        isFlagged: false,
        flagReason: '',
        isRestricted: false,
        restrictedUntil: null,
      },
    }
  );
  console.log(`[verify] Updated ${userResult.modifiedCount} ExternalUsers to ACTIVE status.`);

  // 2. Activate & Verify all Vendor Organizations
  const orgResult = await VendorOrganization.updateMany(
    {},
    {
      $set: {
        status: 'ACTIVE',
        activationState: 'ACTIVE',
        isCommerciallyActive: true,
        isProfileCompleted: true,
        'verification.isVerified': true,
        'verification.verifiedAt': new Date(),
        'verification.notes': 'Auto-verified for test environment flow',
        verificationLadderLevel: 'STARVNT_VERIFIED',
        'manualReview.status': 'APPROVED',
      },
    }
  );
  console.log(`[verify] Updated ${orgResult.modifiedCount} VendorOrganizations to ACTIVE, COMMERCIALLY_ACTIVE and VERIFIED.`);

  // 3. Activate all Vendor Services
  const svcResult = await VendorService.updateMany(
    {},
    {
      $set: {
        status: 'ACTIVE',
      },
    }
  );
  console.log(`[verify] Updated ${svcResult.modifiedCount} VendorServices to ACTIVE status.`);

  // 4. Publish all Portfolio Items
  const portfolioResult = await PortfolioItem.updateMany(
    {},
    {
      $set: {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    }
  );
  console.log(`[verify] Updated ${portfolioResult.modifiedCount} PortfolioItems to PUBLISHED & PUBLIC.`);

  // 5. Ensure all Vendor Organizations have an OperatingLocation & ServiceCoverage
  const allOrgs = await VendorOrganization.find({}).lean();
  let createdLocs = 0;
  let createdCovs = 0;

  for (const org of allOrgs) {
    let loc = await OperatingLocation.findOne({ vendor: org._id });
    if (!loc) {
      // Determine default city/state from org.location or Kapkote
      let city = 'Kapkote';
      let state = 'Uttarakhand';
      let locality = 'Main Market';
      let coords = { lat: 29.9442, lng: 79.9042 };

      const rawLoc = String(org.location || '').toLowerCase();
      if (rawLoc.includes('kolkata')) {
        city = 'Kolkata';
        state = 'West Bengal';
        locality = 'Central Hub';
        coords = { lat: 22.5726, lng: 88.3639 };
      } else if (rawLoc.includes('mumbai')) {
        city = 'Mumbai';
        state = 'Maharashtra';
        locality = 'Central Hub';
        coords = { lat: 19.076, lng: 72.8777 };
      } else if (rawLoc.includes('delhi')) {
        city = 'Delhi';
        state = 'Delhi';
        locality = 'Central Hub';
        coords = { lat: 28.6139, lng: 77.209 };
      } else if (rawLoc.includes('howrah')) {
        city = 'Howrah';
        state = 'West Bengal';
        locality = 'Central Hub';
        coords = { lat: 22.5958, lng: 88.2636 };
      }

      loc = await OperatingLocation.create({
        vendor: org._id,
        label: `${org.businessName} Main Office`,
        type: 'STUDIO',
        address: org.location || `${locality}, ${city}`,
        locality,
        city,
        state,
        postalCode: '263632',
        coordinates: coords,
        isPrimary: true,
      });
      createdLocs++;
    }

    // Ensure TravelPolicy exists
    const tp = await TravelPolicy.findOne({ vendor: org._id });
    if (!tp) {
      await TravelPolicy.create({
        vendor: org._id,
        origin: {
          locality: loc.locality || 'Central Hub',
          city: loc.city || 'Kapkote',
          coordinates: loc.coordinates || { lat: 29.9442, lng: 79.9042 },
        },
        freeRadiusKm: 25,
        ratePerKm: 20,
        flatRates: [],
      });
    }

    // Ensure all services for this vendor have a ServiceCoverage
    const services = await VendorService.find({ vendor: org._id }).lean();
    for (const svc of services) {
      const cov = await ServiceCoverage.findOne({ vendor: org._id, vendorService: svc._id });
      if (!cov) {
        const localities = loc.city === 'Kapkote'
          ? ['Kapkote', 'Kapkot', 'Bageshwar', 'Baijnath', 'Garur', 'Kanda', 'Kausani', 'Almora', 'Bharadi', 'Shama', 'Haldwani']
          : [loc.locality || 'Central Hub', loc.city];

        await ServiceCoverage.create({
          vendor: org._id,
          vendorService: svc._id,
          coverageType: 'CITY',
          city: loc.city,
          state: loc.state,
          localities,
          radiusKm: 75,
          confidence: 'VERIFIED',
          outstationAllowed: true,
        });
        createdCovs++;
      } else if (!cov.radiusKm || cov.radiusKm < 50) {
        cov.radiusKm = 75;
        cov.confidence = 'VERIFIED';
        cov.outstationAllowed = true;
        await cov.save();
      }
    }
  }

  console.log(`[verify] Created ${createdLocs} missing OperatingLocations and ${createdCovs} missing ServiceCoverages.`);

  // 6. Test listBookableServices in catalogRepo for Kapkote, Kolkata, Mumbai, Delhi
  const { listBookableServices } = await import('../src/customer/repositories/catalog.repo.js');
  const kapkoteServices = await listBookableServices({ city: 'Kapkote' });
  const kolkataServices = await listBookableServices({ city: 'Kolkata' });
  const mumbaiServices = await listBookableServices({ city: 'Mumbai' });
  const delhiServices = await listBookableServices({ city: 'Delhi' });
  const allServices = await listBookableServices({});

  console.log('\n--- VERIFICATION TEST RESULTS FOR SEARCH & AURA ---');
  console.log(`Kapkote Services Bookable  : ${kapkoteServices.length}`);
  console.log(`Kolkata Services Bookable  : ${kolkataServices.length}`);
  console.log(`Mumbai Services Bookable   : ${mumbaiServices.length}`);
  console.log(`Delhi Services Bookable    : ${delhiServices.length}`);
  console.log(`Total Bookable Catalog     : ${allServices.length}`);
  console.log('--------------------------------------------------\n');

  await disconnectDB();
  console.log('[verify] Done!');
}

verifyAll().catch((err) => {
  console.error('[verify] Fatal error:', err);
  process.exit(1);
});
