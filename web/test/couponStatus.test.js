import test from 'node:test';
import assert from 'node:assert/strict';
import { couponStatus } from '../src/pages/admin/couponStatus.js';
test('coupon status reflects expiry, start date and exhaustion rather than only its enabled switch', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  assert.equal(couponStatus({ isActive:true,validUntil:'2026-10-14' },now),'Expired');
  assert.equal(couponStatus({ isActive:false },now),'Inactive');
  assert.equal(couponStatus({ isActive:true,validFrom:'2026-11-01' },now),'Scheduled');
  assert.equal(couponStatus({ isActive:true,usageLimit:1,usageCount:1 },now),'Used up');
  assert.equal(couponStatus({ isActive:true,usageLimit:null,usageCount:100 },now),'Active');
});
