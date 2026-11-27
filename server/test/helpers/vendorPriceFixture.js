import mongoose from 'mongoose';
import { Opportunity } from '../../src/external/models/Opportunity.js';
import { Quote } from '../../src/external/models/Quote.js';
export async function vendorPriceFixture(event, category, total = 25000) {
  const vendor = new mongoose.Types.ObjectId(), vendorService = new mongoose.Types.ObjectId();
  const opportunity = await Opportunity.create({ vendor, vendorService, customer: event.customer, customerEvent: event._id, serviceName: category, eventDate: event.eventDate });
  return Quote.create({ opportunity: opportunity._id, vendor, vendorService, customer: event.customer, category, serviceName: category, eventDate: event.eventDate, pricingBreakdown: { basePrice: total, totalAmount: total }, status: 'SUBMITTED', validUntil: new Date(Date.now() + 7 * 86400000) });
}
