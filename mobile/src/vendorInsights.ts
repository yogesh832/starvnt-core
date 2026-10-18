import type { Data } from "./api/client";
const amount = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
export function vendorInsightTotals(bookings: Data[]) {
  return bookings.reduce(
    (total, booking) => {
      total.advanceReceived += amount(booking.paymentSummary?.paidAmount);
      total.recordedBookingValue += amount(booking.totalAmount);
      if (
        booking.paymentStatus === "PAYMENT_VERIFIED" &&
        booking.bookingStatus === "CONFIRMED"
      )
        total.escrow += amount(booking.paymentSummary?.paidAmount);
      if (booking.settlementStatus === "SETTLED")
        total.released += amount(
          booking.settlementDetails?.vendorPayable ??
            booking.settlementMath?.vendorPayable ??
            booking.vendorPayable ??
            booking.totalAmount,
        );
      return total;
    },
    { advanceReceived: 0, recordedBookingValue: 0, escrow: 0, released: 0 },
  );
}
export function reviewText(review: Data): string {
  const text =
    review.reviewText ??
    review.text ??
    review.originalText ??
    review.comment ??
    "";
  return typeof text === "string"
    ? text
    : typeof text?.text === "string"
      ? text.text
      : "";
}
export function reviewerName(review: Data): string {
  return (
    review.customerName ||
    review.authorAttribution?.displayName ||
    review.author_name ||
    review.authorName ||
    review.author ||
    "Reviewer"
  );
}
