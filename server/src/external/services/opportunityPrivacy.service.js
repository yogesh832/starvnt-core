import { CoreBooking } from '../../admin/models/CoreBooking.js';
import { ExternalUser } from '../models/ExternalUser.js';
import { Opportunity } from '../models/Opportunity.js';

function maskEmail(email = '') {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone = '') {
  const s = String(phone || '');
  if (s.length < 4) return '';
  return `${s.slice(0, 3)}****${s.slice(-2)}`;
}

export function canRevealOpportunityContact(opportunity, verifiedBooking = false) {
  return Boolean(opportunity && verifiedBooking === true);
}

export function maskOpportunityCustomer(opportunity, verifiedBooking = false) {
  const plain = opportunity?.toObject ? opportunity.toObject() : { ...(opportunity || {}) };
  if (canRevealOpportunityContact(plain, verifiedBooking)) {
    return plain;
  }
  const customer = plain.customer?.toObject ? plain.customer.toObject() : plain.customer || {};
  const privateValues = [plain.serviceLocation?.address, plain.serviceLocation?.notes, plain.venueLocation,
    customer.email, customer.phone, customer.fullName, plain.clientEmail, plain.clientPhone, plain.clientName, plain.customerName].filter(value => typeof value === 'string' && value.length > 3);
  const redact = text => typeof text === 'string' ? privateValues.reduce((value, secret) => value.split(secret).join('[private detail]'), text) : text;
  for (const key of ['requiredCapability', 'notes', 'description', 'customerSummary', 'locationNotes', 'eventName', 'lastMessageText']) plain[key] = redact(plain[key]);
  if (plain.messages) plain.messages = plain.messages.map(message => ({ ...(message.toObject?.() || message), text: redact(message.text), senderName: message.sender === 'CLIENT' ? 'Customer' : message.senderName }));
  plain.serviceLocation = { locality: plain.serviceLocation?.locality || '', city: plain.serviceLocation?.city || '' };
  plain.venueLocation = '';
  plain.clientEmail = ''; plain.clientPhone = '';
  plain.customerName = 'Customer'; plain.clientName = 'Customer';
  delete plain.originalRequirement;
  delete plain.requirementSnapshot;
  plain.customer = {
    _id: plain.customer?._id || plain.customer || null,
    fullName: 'Customer',
    email: maskEmail(customer.email),
    phone: maskPhone(customer.phone),
    contactMasked: true,
  };
  plain.privacy = {
    contactMasked: true,
    reason: 'Customer contact and exact location require a verified active service booking.',
  };
  return plain;
}

// Resolve authority from current Core records on every response, including legacy threads.
export async function projectVendorContext(input) {
  const plain = input?.toObject ? input.toObject() : { ...input };
  const vendorId = plain.vendor?._id || plain.vendor;
  const customerId = plain.customer?._id || plain.customer;
  const contexts = [{ quoteId: String(plain._id) }, { opportunityId: String(plain._id) }];
  if (plain.booking) contexts.push({ _id: plain.booking });
  if (plain.opportunity) contexts.push({ opportunityId: String(plain.opportunity._id || plain.opportunity) });
  if (plain.quote) contexts.push({ quoteId: String(plain.quote._id || plain.quote) });
  const booked = vendorId && customerId && await CoreBooking.exists({ vendorId, customerId, bookingStatus: 'CONFIRMED', paymentStatus: 'PAYMENT_VERIFIED', executionStatus: { $ne: 'FAILED' }, $or: contexts });
  if (!booked && customerId) {
    const customer = await ExternalUser.findById(customerId).select('_id fullName email phone').lean();
    if (customer) plain.customer = customer;
    if (plain.opportunity && !plain.serviceLocation?.address) {
      const source = await Opportunity.findOne({ _id: plain.opportunity._id || plain.opportunity, vendor: vendorId, customer: customerId }).select('serviceLocation').lean();
      if (source) plain.serviceLocation = source.serviceLocation;
    }
  }
  return maskOpportunityCustomer(plain, Boolean(booked));
}
