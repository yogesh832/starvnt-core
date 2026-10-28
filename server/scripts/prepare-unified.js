// Inventory by default. --apply-indexes creates only the additive indexes used
// by the unified workflows; this script never approves vendors or rewrites data.
import mongoose from 'mongoose';
import { connectDB, disconnectDB, externalConn } from '../src/db/index.js';
mongoose.set('autoIndex', false);
const { VendorBlockout } = await import('../src/external/models/VendorBlockout.js');
const { EventMessage, CustomerNotification } = await import('../src/customer/models/index.js');
const { NotificationPreference, CustomerReminder } = await import('../src/notifications/preferences.models.js');
const { ProductObservation, CustomerFeedback } = await import('../src/common/productObservability.js');
const { PushJob } = await import('../src/notifications/push.models.js');
await connectDB();
try {
  if (process.argv.includes('--apply-indexes')) {
    for (const model of [VendorBlockout, EventMessage, CustomerNotification, NotificationPreference, CustomerReminder, ProductObservation, CustomerFeedback, PushJob]) await model.createIndexes();
    console.log('Additive unified-workflow indexes prepared. No business states changed.');
  }
  const organizations = externalConn.collection('vendororganizations');
  const blocks = externalConn.collection('vendorblockouts');
  const slots = externalConn.collection('vendorbookingslots');
  console.log(JSON.stringify({
    activeVendorsNeedingExplicitReview: await organizations.countDocuments({ status: 'ACTIVE', 'activationReview.status': { $ne: 'APPROVED' } }),
    legacyBlocksWithoutCanonicalInterval: await blocks.countDocuments({ startAt: { $exists: false } }),
    legacyOperationalCommitments: await slots.countDocuments({ status: { $nin: ['CANCELLED', 'COMPLETED'] } }),
  }, null, 2));
} finally { await disconnectDB(); }
