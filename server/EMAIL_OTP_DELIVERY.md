# Email OTP acceptance and error reporting

The send endpoint awaits the selected provider. Success means the provider acknowledged the message, not that it arrived in the recipient's inbox.

Response `delivery` contains provider, status `accepted`, provider message ID and `inboxConfirmed: false`. Web and native OTP screens display this distinction. Resend responses must contain a message ID. SMTP responses must explicitly accept the requested recipient with no rejection or pending deferral for that address. SMTP connection, greeting and socket timeouts are bounded.

Failures return non-2xx with a safe user-facing message: missing configuration (503), unavailable connection (503), sender authentication failure (502), rejected recipient (502), Resend rejection (502), or other send failure (502). Provider keys, mail bodies and OTP values are not returned. Failed-send challenges are invalidated. Mobile keeps these actionable messages instead of replacing them with a generic server error.

Verification on 21 October 2026: configured local Gmail SMTP authentication passed. One explicitly authorized test to each of the two requested Gmail addresses was acknowledged by SMTP. The first recipient reported no receipt; the second recipient confirmed receipt. No account was created by these tests. At the user’s subsequent request, the second address’s pre-existing account, sessions and test challenge were removed, and its linked listing/service deactivated. SMTP acceptance cannot establish downstream delivery, Spam placement, or a later bounce. Gmail sender Sent/Bounce records must be checked to diagnose the remaining delivery problem; this implementation has no Gmail delivery-event feed. Production environment settings may differ from the local configuration.

Automated coverage includes accepted/rejected/pending/missing SMTP acknowledgement, authentication/connectivity failures, missing/error Resend acknowledgements and mobile error message propagation. No live mail is sent by tests.
