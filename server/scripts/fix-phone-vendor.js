import mongoose from 'mongoose';
import { config } from '../src/config.js';

async function run() {
  await mongoose.connect(config.mongoUriExternal);
  const usersColl = mongoose.connection.collection('externalusers');
  const orgsColl = mongoose.connection.collection('vendororganizations');

  const user = await usersColl.findOne({ phone: '+919259756979' });
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }
  console.log('Found user:', user._id, user.phone, user.accountType);

  let org = await orgsColl.findOne({ owner: user._id });
  if (!org) {
    const orgDoc = {
      businessName: 'Yogesh Upadhayay Studio',
      category: 'Cinematic Production',
      location: 'Mumbai',
      owner: user._id,
      status: 'PENDING',
      activationState: 'REGISTERED',
      isCommerciallyActive: false,
      isProfileCompleted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const res = await orgsColl.insertOne(orgDoc);
    org = { _id: res.insertedId };
    console.log('Created VendorOrganization:', org._id);
  }

  await usersColl.updateOne(
    { _id: user._id },
    {
      $set: {
        accountType: 'VENDOR',
        fullName: 'Yogesh Upadhayay',
        vendorOrganization: org._id,
        updatedAt: new Date(),
      },
    }
  );

  const updatedUser = await usersColl.findOne({ _id: user._id });
  console.log('Successfully updated user to VENDOR:', {
    _id: updatedUser._id,
    phone: updatedUser.phone,
    accountType: updatedUser.accountType,
    vendorOrganization: updatedUser.vendorOrganization,
  });

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
