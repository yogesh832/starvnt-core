/** Validate all tenant links before a commercial quote can be written. */
export async function vendorQuoteScope(input, { findOpportunity, findService }) {
  const {vendorId,opportunityId,vendorServiceId,customerId}=input;
  if(!opportunityId)return {status:400,error:'OWNED_ENQUIRY_REQUIRED'};
  const opportunity=await findOpportunity(opportunityId,vendorId);
  if(!opportunity)return {status:404,error:'OPPORTUNITY_NOT_FOUND'};
  if(opportunity&&customerId&&String(customerId)!==String(opportunity.customer))return {status:400,error:'QUOTE_CUSTOMER_MISMATCH'};
  if(vendorServiceId&&String(vendorServiceId)!==String(opportunity.vendorService))return {status:400,error:'QUOTE_SERVICE_MISMATCH'};
  const serviceId=opportunity.vendorService;
  const service=serviceId ? await findService(serviceId,vendorId) : null;
  if(!service)return {status:404,error:'SERVICE_NOT_FOUND'};
  const resolvedCustomer=opportunity.customer;
  if(!resolvedCustomer)return {status:400,error:'CUSTOMER_ID_REQUIRED'};
  return {customerId:resolvedCustomer,vendorServiceId:service._id};
}

export function quoteEventMismatch(linkedEventId, requestedEventId) {
  return Boolean(linkedEventId && requestedEventId && String(linkedEventId) !== String(requestedEventId));
}

/** Retrying acceptance must not reopen a converted/paid reservation. */
export function reuseAcceptedReservation(quote, reservation) {
  return quote.status === 'APPROVED' && Boolean(reservation) && !['expired','cancelled'].includes(reservation.status);
}
