import { requireExternalAuth, requireAccountType } from '../../external/middleware/requireExternalAuth.js';

/** Existing external login, restricted to CUSTOMER accounts. */
export const requireCustomer = [requireExternalAuth, requireAccountType('CUSTOMER')];
