/** GST registration is optional; opting out is never proof of identity. */
export function vendorVerification(financial, hasVerifiedDocument = false) {
  const identitySource = financial?.pan?.verificationStatus === 'VERIFIED' ? 'PAN_VERIFICATION'
    : financial?.gst?.verificationStatus === 'VERIFIED' ? 'GST_VERIFICATION'
    : hasVerifiedDocument ? 'ADMIN_APPROVED_DOCUMENT' : 'NOT_VERIFIED';
  const bankVerified = financial?.bankAccount?.verificationStatus === 'VERIFIED';
  return { identityVerified: identitySource !== 'NOT_VERIFIED', bankVerified, identitySource };
}
