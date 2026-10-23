import assert from 'node:assert/strict';
import {test} from 'node:test';
import {vendorQuoteScope,quoteEventMismatch,reuseAcceptedReservation} from '../src/common/vendorQuoteScope.js';
const store={
  findOpportunity:async(id,vendor)=>id==='lead-a'&&vendor==='vendor-a'?{customer:'customer-a',vendorService:'service-a'}:null,
  findService:async(id,vendor)=>id==='service-a'&&vendor==='vendor-a'?{_id:id}:null,
};
test('a vendor cannot create a quote against another vendor enquiry or service',async()=>{
  assert.equal((await vendorQuoteScope({vendorId:'vendor-b',opportunityId:'lead-a',vendorServiceId:'service-a',customerId:'customer-a'},store)).error,'OPPORTUNITY_NOT_FOUND');
  assert.equal((await vendorQuoteScope({vendorId:'vendor-b',vendorServiceId:'service-a',customerId:'customer-a'},store)).error,'SERVICE_NOT_FOUND');
});
test('quote creation uses the owned enquiry customer and cannot substitute another',async()=>{
  assert.deepEqual(await vendorQuoteScope({vendorId:'vendor-a',opportunityId:'lead-a'},store),{customerId:'customer-a',vendorServiceId:'service-a'});
  assert.equal((await vendorQuoteScope({vendorId:'vendor-a',opportunityId:'lead-a',customerId:'customer-b'},store)).error,'QUOTE_CUSTOMER_MISMATCH');
});
test('acceptance cannot mix events or reopen a paid reservation on retry',()=>{
  assert.equal(quoteEventMismatch('event-a','event-b'),true);
  assert.equal(quoteEventMismatch('event-a','event-a'),false);
  assert.equal(quoteEventMismatch('event-a',undefined),false);
  for(const status of ['pending_payment','converted'])assert.equal(reuseAcceptedReservation({status:'APPROVED'},{status}),true);
  for(const status of ['expired','cancelled'])assert.equal(reuseAcceptedReservation({status:'APPROVED'},{status}),false);
  assert.equal(reuseAcceptedReservation({status:'SUBMITTED'},{status:'pending_payment'}),false);
});
