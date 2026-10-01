import { ExternalUser } from '../../external/models/ExternalUser.js';

// A customer is any identity holding the CUSTOMER role (one email can also be a vendor).
// Legacy users have no `roles`, only accountType.
const IS_CUSTOMER = { $or: [{ roles: 'CUSTOMER' }, { accountType: 'CUSTOMER' }] };

export function findCustomer(customerId) {
  return ExternalUser.findOne({ _id: customerId, ...IS_CUSTOMER });
}

export function updateCustomer(customerId, fields) {
  return ExternalUser.findOneAndUpdate(
    { _id: customerId, ...IS_CUSTOMER },
    { $set: fields },
    { new: true, runValidators: true }
  );
}
