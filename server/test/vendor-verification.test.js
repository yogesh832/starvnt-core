import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vendorVerification } from '../src/common/vendorVerification.js';
import { VENDOR_SETUP_STEPS } from '../src/common/vendorSetupSteps.js';

test('viewing a default financial profile or declaring no GST does not verify identity', () => {
  for (const profile of [undefined, {}, {gst:{isRegistered:false}}, {gst:{isRegistered:false},bankAccount:{verificationStatus:'VERIFIED'}}]) {
    assert.equal(vendorVerification(profile).identityVerified, false);
    assert.equal(vendorVerification(profile).identitySource, 'NOT_VERIFIED');
  }
});
test('identity and bank verification are independent requirements', () => {
  assert.deepEqual(vendorVerification({pan:{verificationStatus:'VERIFIED'}}), {identityVerified:true,bankVerified:false,identitySource:'PAN_VERIFICATION'});
  assert.equal(vendorVerification({gst:{verificationStatus:'VERIFIED'}}).identitySource,'GST_VERIFICATION');
  assert.equal(vendorVerification({},true).identitySource,'ADMIN_APPROVED_DOCUMENT');
  assert.equal(vendorVerification({pan:{verificationStatus:'FAILED'},bankAccount:{verificationStatus:'VERIFIED'}}).identityVerified,false);
});
test('five filled profile sections cannot hide missing availability or capacity', () => {
  const ready={profile:true,services:true,capabilities:true,capacity:true,resources:true,locations:true,coverage:true,availability:true,portfolio:true};
  assert.equal(VENDOR_SETUP_STEPS.length,6);
  assert.equal(VENDOR_SETUP_STEPS.every(step=>step.done(ready)),true);
  assert.equal(VENDOR_SETUP_STEPS.find(step=>!step.done({...ready,availability:false})).key,'availability');
  assert.equal(VENDOR_SETUP_STEPS.find(step=>!step.done({...ready,capacity:false})).key,'capabilities');
});
