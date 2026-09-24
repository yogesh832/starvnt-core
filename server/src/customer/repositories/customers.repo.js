import { ExternalUser } from '../../external/models/ExternalUser.js';

export function findCustomer(customerId) {
  return ExternalUser.findOne({ _id: customerId, accountType: 'CUSTOMER' });
}

export function updateCustomer(customerId, fields) {
  return ExternalUser.findOneAndUpdate(
    { _id: customerId, accountType: 'CUSTOMER' },
    { $set: fields },
    { new: true, runValidators: true }
  );
}
