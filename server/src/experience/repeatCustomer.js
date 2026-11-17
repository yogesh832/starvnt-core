/** Count canonical completed Core bookings, never external records or service lines. */
export function repeatBookingEvidence(bookings) {
  const aliases = new Map(), groups = [];
  for (const booking of bookings) {
    const keys = ['customerBookingId', 'quoteId', 'reservationId'].filter(k => booking[k]).map(k => `${k}:${booking[k]}`);
    keys.push(`id:${booking._id}`);
    const existing = [...new Set(keys.map(k => aliases.get(k)).filter(Boolean))];
    const group = existing[0] || { ids: new Set(), keys: new Set(), records: [] };
    if (!existing.length) groups.push(group);
    for (const other of existing.slice(1)) {
      for (const id of other.ids) group.ids.add(id);
      group.records.push(...other.records);
      for (const key of other.keys) { group.keys.add(key); aliases.set(key, group); }
      groups.splice(groups.indexOf(other), 1);
    }
    group.ids.add(String(booking._id));
    group.records.push(booking);
    for (const key of keys) { group.keys.add(key); aliases.set(key, group); }
  }
  const qualified = booking => (!booking.source || booking.source === 'STARVNT') && booking.bookingStatus === 'CONFIRMED'
    && booking.executionStatus === 'COMPLETION_VERIFIED' && booking.paymentStatus === 'PAYMENT_VERIFIED'
    && booking.cancellation?.refundStatus !== 'REFUNDED'
    && !booking.financeOperations?.some(op => op.kind === 'REFUND' && op.status === 'CONFIRMED' && Number(op.amount) > 0);
  // Conflicting duplicates must not borrow a good state from another copy.
  return groups.filter(g => g.records.every(qualified)).map(g => ({ bookingId: [...g.ids].sort()[0], duplicateRecordIds: [...g.ids].sort() }));
}
