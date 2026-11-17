# Live Razorpay payment readiness

The backend uses the private `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` pair. The public key ID is returned with a server-created order; the secret is never sent to the browser or mobile app. A live key selects real-money Checkout independently of the application's development/test database setting.

## Payment evidence

- Order amount, INR currency, approved commercial terms and any coupon are calculated on the backend.
- Checkout callbacks require a matching order ID and a valid HMAC. The backend independently fetches the order's payments and confirms capture, currency and exact amount.
- A valid callback for an authorised but uncaptured payment leaves it processing. It cannot confirm a booking.
- Callback retries and payment-status checks reuse the same stored receipt. Duplicate confirmations must not increase collected amounts.
- Customer payment history has a recovery action if Checkout closes before its callback reaches the backend.
- Concurrent Checkout requests for one reservation cannot create competing provider orders. A pending order cannot be silently replaced with different coupon or payment terms.
- Balance Checkout uses the current confirmed booking's outstanding amount. An earlier verified advance does not block the balance payment. Bookings without an authoritative customer booking/payment link require finance review before balance collection.
- Expired holds and demo bookings cannot initiate real-money Checkout.

## Asynchronous webhook recovery

A private `RAZORPAY_WEBHOOK_SECRET` is prepared in the ignored backend environment files. It is separate from the API key secret.

After the backend and its private environment are released, register a **Live Mode** webhook on the merchant dashboard:

```text
https://app.starvnt.com/api/webhooks/razorpay
```

Use the private webhook secret from the backend environment and subscribe to `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed` and `refund.failed`. The server verifies the raw-body HMAC and deduplicates delivery IDs. Refund handling also depends on the released backend revision and finance execution policy.

The public URL is the production backend. Local files and development servers do not install the secret there or register the dashboard subscription. Until that release/setup is complete, Checkout callback verification and explicit server reconciliation work locally; background webhook delivery is not established.

## Evidence and limits

The live credentials have passed read-only authentication checks for Orders, Contacts and Bank Validation lookup. An unpaid live ₹1 order was created and payment lookup succeeded with zero amount paid. Its local metadata is in `tmp/razorpay-integration/live-provider-check.json`; no customer was charged.

The isolated integration tests cover captured versus authorised evidence, amount/order/currency mismatch, forged signatures, duplicate callbacks, concurrent order creation, expired/demo restrictions, balance collection and matching totals in Customer and Vendor views. These use simulated provider responses. They do not constitute a successful charged live transaction.

Run the full backend suites using an explicit credential-free test environment and `--test-concurrency=1` on this Windows workstation to avoid parallel temporary-MongoDB startup exhaustion. Verify production capture and asynchronous recovery with an explicitly authorised real checkout after the release and webhook registration; do not use a vendor payout or refund as a connectivity test.
