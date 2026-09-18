import { config } from '../src/config.js';
import { connectDB, disconnectDB } from '../src/db/index.js';
import { ExternalUser } from '../src/external/models/ExternalUser.js';
import { VendorOrganization } from '../src/external/models/VendorOrganization.js';
import { hashPassword } from '../src/external/utils/password.js';

const DEMO_VENDOR = {
  fullName: 'Premium Moments Studio',
  email: 'vendor@starvnt.com',
  password: 'Password123',
  phone: '+91 98765 43210',
  accountType: 'VENDOR',
  businessName: 'Premium Moments',
  category: 'Photography',
  location: 'Kolkata, West Bengal',
};

async function main() {
  await connectDB();

  const passwordHash = await hashPassword(DEMO_VENDOR.password);
  let user = await ExternalUser.findOne({ email: DEMO_VENDOR.email });

  if (user) {
    user.fullName = DEMO_VENDOR.fullName;
    user.passwordHash = passwordHash;
    user.accountType = 'VENDOR';
    user.status = 'ACTIVE';
    await user.save();
    console.log(`[seed] Vendor user updated: ${user.email}`);
  } else {
    user = await ExternalUser.create({
      fullName: DEMO_VENDOR.fullName,
      email: DEMO_VENDOR.email,
      passwordHash,
      phone: DEMO_VENDOR.phone,
      accountType: 'VENDOR',
      status: 'ACTIVE',
    });
    console.log(`[seed] Vendor user created: ${user.email}`);
  }

  let org = await VendorOrganization.findOne({ owner: user._id });
  if (org) {
    org.businessName = DEMO_VENDOR.businessName;
    org.category = DEMO_VENDOR.category;
    org.location = DEMO_VENDOR.location;
    org.status = 'VERIFIED';
    await org.save();
    console.log(`[seed] VendorOrganization updated: ${org.businessName}`);
  } else {
    org = await VendorOrganization.create({
      businessName: DEMO_VENDOR.businessName,
      category: DEMO_VENDOR.category,
      location: DEMO_VENDOR.location,
      owner: user._id,
      status: 'VERIFIED',
    });
    console.log(`[seed] VendorOrganization created: ${org.businessName}`);
  }

  user.vendorOrganization = org._id;
  await user.save();

  console.log('\n=======================================');
  console.log('✓ Demo Vendor Account Ready:');
  console.log(`  Email:    ${DEMO_VENDOR.email}`);
  console.log(`  Password: ${DEMO_VENDOR.password}`);
  console.log(`  Business: ${DEMO_VENDOR.businessName}`);
  console.log('=======================================\n');

  await disconnectDB();
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
