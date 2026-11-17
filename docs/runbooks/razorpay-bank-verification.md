# Vendor bank verification with RazorpayX

Vendor bank verification now uses RazorpayX Account Validation. Cashfree calls and simulated verification have been removed from this flow. Existing bank-verification audit history and verified accounts are preserved; changing bank details clears their verification and settlement eligibility.

## Configuration

Set these in the backend's private environment or secret manager. Do not put secrets in tracked files or frontend/mobile environment variables.

```dotenv
BANK_VERIFICATION_PROVIDER=RAZORPAY
RAZORPAYX_BANK_VERIFICATION_ENABLED=true
RAZORPAYX_KEY_ID=
RAZORPAYX_KEY_SECRET=
RAZORPAYX_ACCOUNT_NUMBER=
RAZORPAYX_WEBHOOK_SECRET=
```

The key ID must be a live RazorpayX key. `RAZORPAYX_ACCOUNT_NUMBER` is STARVNT's RazorpayX source account, not a vendor's beneficiary account. Checkout's `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` remain separate. The saved Checkout test keys do not enable bank verification.

Razorpay currently requires RazorpayX Lite Account Validation access and allowlisting the backend's outbound IP. Bank Account Validation is unavailable in test mode. Confirm account access and the source account with Razorpay before enabling execution. See [Account Validation requirements](https://razorpay.com/docs/api/x/account-validation/) and [Composite Bank Validation](https://razorpay.com/docs/api/x/composite-account-validation/bank-account/).

The implementation requests `penniless` validation. Provider fees and access depend on the merchant's Razorpay agreement. No payout endpoint is called. An unavailable provider, missing credentials, an unknown result or a name mismatch cannot produce a verified bank account.

## Vendor flow

The existing authenticated endpoints remain:

- `POST /api/vendor/financial/bank`: validate and save the account holder, account number, IFSC, bank name and account type. Changed details invalidate verification.
- `POST /api/vendor/financial/bank/verify`: submit the current account to RazorpayX, or check the existing pending validation through Razorpay's GET endpoint. Repeat requests do not create another outstanding validation.
- `GET /api/vendor/financial`: return the financial profile and public provider availability, without credentials.
- `GET /api/vendor/financial/bank/verifications`: return the vendor's audit history, with masked account numbers in new Razorpay audit records.

The account becomes verified only when Razorpay confirms completion, an active account and a sufficiently matching returned holder name. Pending results remain processing. A separate verified PAN is required for settlement eligibility. Normal activation and finance approval requirements still apply.

## Webhook and deployment

After the backend release, configure the RazorpayX webhook at:

```text
https://app.starvnt.com/api/webhooks/razorpayx
```

Subscribe to `fund_account.validation.completed` and `fund_account.validation.failed`, using the same private secret as `RAZORPAYX_WEBHOOK_SECRET`. This is separate from Checkout's `/api/webhooks/razorpay` webhook. The bank webhook checks the raw-body signature and fetches the latest provider result before updating the stored matching account. Duplicate terminal notifications are ignored.

For an ambiguous timeout or a provider error with no returned validation ID, the request remains processing and cannot be resubmitted automatically. Operations must locate the original validation using its reference in Razorpay and reconcile it before another attempt. Do not clear pending records simply to retry: the provider may already have accepted the request.

Deploy shared backend changes through the matching release workflow, review both product lines, install the private environment settings, and restart the backend. Changing local `.env` files or production example files does not update the live service. Until configured, the Vendor web/mobile screens let vendors save their details and show that verification is unavailable.

## Validation

`server/test/razorpay-integration.test.js` exercises default Razorpay routing, input rejection, provider readiness, pending and concurrent requests, timeout handling, name mismatch, the documented create/GET response shapes, signature rejection, duplicate callbacks and bank-detail edits. These tests use isolated databases and simulated provider responses; they do not establish live account access or live verification success.
