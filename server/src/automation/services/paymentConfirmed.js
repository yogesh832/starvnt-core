/** Reconcile from stored payment truth; an outbox payload cannot verify money. */
export async function reconcileConfirmedPayment(payload, { getPayment, findBooking, confirmBooking }) {
  if (!payload?.paymentId) throw new Error('PAYMENT_ID_REQUIRED');
  const payment = await getPayment(payload.paymentId);
  if (!payment || payment.status !== 'verified') throw new Error('PAYMENT_NOT_VERIFIED');
  if ((payload.eventId && String(payment.event) !== String(payload.eventId)) ||
      (payload.reservationId && String(payment.reservation) !== String(payload.reservationId))) {
    throw new Error('PAYMENT_CONTEXT_MISMATCH');
  }
  // Inline verification may already have applied the payment. Never add the
  // advance again, including when several payments share a reservation.
  const existing = await findBooking(payment.reservation);
  const booking = existing || await confirmBooking(payment);
  if (!booking) throw new Error('PAYMENT_BOOKING_NOT_READY');
  return { handled: true, paymentId: String(payment._id), bookingId: String(booking._id), bookingStatus: booking.status };
}
