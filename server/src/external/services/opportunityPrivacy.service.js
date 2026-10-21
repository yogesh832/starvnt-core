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

export function canRevealOpportunityContact(opportunity, quoteStatus = null) {
  if (!opportunity) return false;
  return (
    opportunity.status === 'RESPONDED' ||
    ['SUBMITTED', 'APPROVED'].includes(String(quoteStatus || '').toUpperCase())
  );
}

export function maskOpportunityCustomer(opportunity, quoteStatus = null) {
  const plain = opportunity?.toObject ? opportunity.toObject() : { ...(opportunity || {}) };
  if (!plain.customer || canRevealOpportunityContact(plain, quoteStatus)) {
    return plain;
  }
  const customer = plain.customer?.toObject ? plain.customer.toObject() : { ...plain.customer };
  plain.customer = {
    ...customer,
    fullName: customer.fullName || plain.customerName || 'Customer',
    email: maskEmail(customer.email),
    phone: maskPhone(customer.phone),
    contactMasked: true,
  };
  plain.privacy = {
    contactMasked: true,
    reason: 'Customer contact is hidden until the vendor responds or a quote is in progress.',
  };
  return plain;
}
