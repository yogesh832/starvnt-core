import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileConfirmedPayment } from '../src/automation/services/paymentConfirmed.js';

test('confirmed-payment jobs reuse existing bookings without applying the advance twice', async () => {
  const payment = { _id:'p2',status:'verified',event:'e',reservation:'r',amount:6000 };
  let confirmations = 0;
  const deps = { getPayment:async()=>payment,findBooking:async()=>({_id:'b',payment:'p1',status:'confirmed'}),confirmBooking:async()=>{confirmations++;} };
  for(let i=0;i<2;i++) assert.equal((await reconcileConfirmedPayment({paymentId:'p2',eventId:'e',reservationId:'r'},deps)).bookingId,'b');
  assert.equal(confirmations,0);
});
test('confirmed-payment jobs recover missing bookings using stored payment data', async () => {
  const payment = { _id:'p',status:'verified',event:'e',reservation:'r',amount:6000 };
  const deps = { getPayment:async()=>payment,findBooking:async()=>null,confirmBooking:async(record)=>{assert.equal(record,payment);return {_id:'b',status:'pending'};} };
  const result = await reconcileConfirmedPayment({paymentId:'p',amount:999999},deps);
  assert.equal(result.bookingStatus,'pending');
});
test('outbox data cannot verify an unpaid payment or substitute another reservation', async () => {
  let writes = 0;
  const payment = { _id:'p',status:'pending',event:'e',reservation:'r' };
  const deps = {getPayment:async()=>payment,findBooking:async()=>{writes++;},confirmBooking:async()=>{writes++;}};
  await assert.rejects(reconcileConfirmedPayment({paymentId:'p'},deps),/PAYMENT_NOT_VERIFIED/);
  payment.status='verified';
  await assert.rejects(reconcileConfirmedPayment({paymentId:'p',reservationId:'wrong'},deps),/PAYMENT_CONTEXT_MISMATCH/);
  assert.equal(writes,0);
});
