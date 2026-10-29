const recordId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

export function buildVendorAnalyticsMetrics({ enquiries = [], quotes = [], bookings = [] } = {}) {
  const submittedQuotes = quotes.filter((quote) => quote?.status && quote.status !== 'DRAFT');
  const quoteIds = new Set(submittedQuotes.map((quote) => recordId(quote._id || quote.id)).filter(Boolean));
  const enquiryIds = new Set(enquiries.map((enquiry) => recordId(enquiry._id || enquiry.id)).filter(Boolean));
  const quotedEnquiryIds = new Set(
    submittedQuotes
      .map((quote) => recordId(quote.opportunity))
      .filter((id) => id && enquiryIds.has(id)),
  );
  const confirmedBookings = bookings.filter((booking) => booking?.bookingStatus === 'CONFIRMED');
  const bookedQuoteIds = new Set(confirmedBookings.map((booking) => recordId(booking.quoteId)).filter((id) => id && quoteIds.has(id)));
  const uniqueConfirmedBookings = [];
  const seenQuoteIds = new Set();
  for (const booking of confirmedBookings) {
    const quoteId = recordId(booking.quoteId);
    if (quoteId && seenQuoteIds.has(quoteId)) continue;
    if (quoteId) seenQuoteIds.add(quoteId);
    uniqueConfirmedBookings.push(booking);
  }
  return {
    enquiriesCount: enquiryIds.size,
    quotedEnquiriesCount: quotedEnquiryIds.size,
    quotesCount: submittedQuotes.length,
    bookingsCount: confirmedBookings.length,
    linkedBookingsCount: bookedQuoteIds.size,
    confirmedBookingValue: uniqueConfirmedBookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0),
    verifiedAdvanceReceived: uniqueConfirmedBookings
      .filter((booking) => booking.paymentStatus === 'PAYMENT_VERIFIED')
      .reduce((sum, booking) => sum + Number(booking.paymentSummary?.paidAmount || 0), 0),
  };
}
