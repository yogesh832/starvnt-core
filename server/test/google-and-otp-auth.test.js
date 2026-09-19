import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Multi-Option Auth: Google OAuth and Mobile Phone OTP for Customers & Vendors', async () => {
  const { app, mongod, models, disconnectDB } = await setupTestApp();

  try {
    // ── 1. Google Auth for CUSTOMER ─────────────────────────────────────────
    const googleCustRes = await request(app)
      .post('/api/auth/google')
      .send({
        credential: 'test:ananya.google@example.com:Ananya Sharma:google-sub-99881',
        accountType: 'CUSTOMER',
      });

    assert.equal(googleCustRes.status, 200);
    assert.ok(googleCustRes.body.accessToken, 'Must return JWT accessToken');
    assert.equal(googleCustRes.body.user.email, 'ananya.google@example.com');
    assert.equal(googleCustRes.body.user.fullName, 'Ananya Sharma');
    assert.equal(googleCustRes.body.user.accountType, 'CUSTOMER');
    assert.equal(googleCustRes.body.user.authProvider, 'GOOGLE');

    const custToken = googleCustRes.body.accessToken;

    // Verify customer token reaches customer protected route
    const custMe = await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(custMe.status, 200);
    assert.equal(custMe.body.user.email, 'ananya.google@example.com');

    // ── 2. Google Auth for VENDOR (Creates VendorOrganization) ───────────────
    const googleVendorRes = await request(app)
      .post('/api/auth/google')
      .send({
        credential: 'test:vikram.vendor@example.com:Vikram Malhotra:google-sub-77662',
        accountType: 'VENDOR',
        businessName: 'Malhotra Cine Works',
        category: 'Cinematic Production',
        city: 'Mumbai',
      });

    assert.equal(googleVendorRes.status, 200);
    assert.ok(googleVendorRes.body.accessToken);
    assert.equal(googleVendorRes.body.user.accountType, 'VENDOR');
    assert.ok(googleVendorRes.body.user.vendorOrganization);

    const vendorOrg = await models.VendorOrganization.findById(
      googleVendorRes.body.user.vendorOrganization
    );
    assert.ok(vendorOrg);
    assert.equal(vendorOrg.businessName, 'Malhotra Cine Works');
    assert.equal(vendorOrg.category, 'Cinematic Production');
    assert.equal(vendorOrg.location, 'Mumbai');

    const vendorToken = googleVendorRes.body.accessToken;

    // Verify vendor token reaches vendor protected route
    const vendorProf = await request(app)
      .get('/api/vendor/profile')
      .set('Authorization', `Bearer ${vendorToken}`);
    assert.equal(vendorProf.status, 200);
    assert.equal(vendorProf.body.vendor.businessName, 'Malhotra Cine Works');

    // ── 2b. Google Auth for VENDOR without details (0% initial completion) ───
    const blankVendorRes = await request(app)
      .post('/api/auth/google')
      .send({
        credential: 'test:leeladhar.google@example.com:Yogesh Upadhayay:google-sub-33441',
        accountType: 'VENDOR',
      });
    assert.equal(blankVendorRes.status, 200);
    const blankToken = blankVendorRes.body.accessToken;

    const blankOrg = await models.VendorOrganization.findById(
      blankVendorRes.body.user.vendorOrganization
    );
    assert.ok(blankOrg);
    assert.equal(blankOrg.isProfileCompleted, false);

    // Initial activation-status must be 0% with profile incomplete
    const blankStatusRes = await request(app)
      .get('/api/vendor/activation-status')
      .set('Authorization', `Bearer ${blankToken}`);
    assert.equal(blankStatusRes.status, 200);
    assert.equal(blankStatusRes.body.status.completionPercentage, 0);
    assert.equal(blankStatusRes.body.status.checklist.profile, false);
    assert.equal(blankStatusRes.body.status.is100Percent, false);

    // Updating profile completes step 1 (Brand & City) to 20%
    const updateProfRes = await request(app)
      .put('/api/vendor/profile')
      .set('Authorization', `Bearer ${blankToken}`)
      .send({
        businessName: "Yogesh Films",
        category: 'Cinematic Production',
        city: 'Mumbai',
      });
    assert.equal(updateProfRes.status, 200);
    assert.equal(updateProfRes.body.activation.completionPercentage, 20);
    assert.equal(updateProfRes.body.activation.checklist.profile, true);

    // ── 3. Google Re-login (Idempotency) ────────────────────────────────────
    const googleRelogin = await request(app)
      .post('/api/auth/google')
      .send({
        credential: 'test:ananya.google@example.com:Ananya Sharma:google-sub-99881',
      });
    assert.equal(googleRelogin.status, 200);
    assert.equal(googleRelogin.body.user.id, googleCustRes.body.user.id);

    // ── 4. Mobile OTP: Send Challenge ───────────────────────────────────────
    const sendOtpRes = await request(app)
      .post('/api/auth/otp/send')
      .send({ phone: '9876543210' });

    assert.equal(sendOtpRes.status, 200);
    assert.equal(sendOtpRes.body.ok, true);
    assert.equal(sendOtpRes.body.phone, '+919876543210');
    assert.ok(sendOtpRes.body.devOtp, 'Should provide OTP challenge');
    const receivedOtp = sendOtpRes.body.devOtp;

    // ── 5. Mobile OTP: Verify with wrong code -> 400 INVALID_OTP ────────────
    const wrongOtpRes = await request(app)
      .post('/api/auth/otp/verify')
      .send({
        phone: '9876543210',
        otp: '000000',
      });
    assert.equal(wrongOtpRes.status, 400);
    assert.equal(wrongOtpRes.body.error, 'INVALID_OTP');

    // ── 6. Mobile OTP: Verify and register CUSTOMER ─────────────────────────
    const verifyCustRes = await request(app)
      .post('/api/auth/otp/verify')
      .send({
        phone: '9876543210',
        otp: receivedOtp,
        accountType: 'CUSTOMER',
        fullName: 'Pooja Hegde',
      });

    assert.equal(verifyCustRes.status, 200);
    assert.ok(verifyCustRes.body.accessToken);
    assert.equal(verifyCustRes.body.user.phone, '+919876543210');
    assert.equal(verifyCustRes.body.user.fullName, 'Pooja Hegde');
    assert.equal(verifyCustRes.body.user.accountType, 'CUSTOMER');
    assert.equal(verifyCustRes.body.user.authProvider, 'PHONE');

    // ── 7. Mobile OTP: Verify and register VENDOR ───────────────────────────
    const sendOtpVendor = await request(app)
      .post('/api/auth/otp/send')
      .send({ phone: '+919123456789' });
    assert.equal(sendOtpVendor.status, 200);

    const verifyVendorRes = await request(app)
      .post('/api/auth/otp/verify')
      .send({
        phone: '+919123456789',
        otp: sendOtpVendor.body.devOtp,
        accountType: 'VENDOR',
        fullName: 'Devraj Kapoor',
        businessName: 'Kapoor Lights & Sound',
        category: 'DJ & Music',
        city: 'Delhi',
      });

    assert.equal(verifyVendorRes.status, 200);
    assert.ok(verifyVendorRes.body.accessToken);
    assert.equal(verifyVendorRes.body.user.accountType, 'VENDOR');
    assert.ok(verifyVendorRes.body.user.vendorOrganization);

    const vendorOrgOtp = await models.VendorOrganization.findById(
      verifyVendorRes.body.user.vendorOrganization
    );
    assert.ok(vendorOrgOtp);
    assert.equal(vendorOrgOtp.businessName, 'Kapoor Lights & Sound');
    assert.equal(vendorOrgOtp.category, 'DJ & Music');

    // ── 8. Re-login via Master Dev OTP ──────────────────────────────────────
    const reloginOtp = await request(app)
      .post('/api/auth/otp/verify')
      .send({
        phone: '9876543210',
        otp: '123456',
      });
    assert.equal(reloginOtp.status, 200);
    assert.equal(reloginOtp.body.user.phone, '+919876543210');

    // ── 9. MSG91 OTP Widget Verification ────────────────────────────────────
    const widgetCustRes = await request(app)
      .post('/api/auth/otp/widget-verify')
      .send({
        accessToken: 'test:widget:+919811223344',
        accountType: 'CUSTOMER',
        fullName: 'Rohit Verma',
      });
    assert.equal(widgetCustRes.status, 200);
    assert.ok(widgetCustRes.body.accessToken);
    assert.equal(widgetCustRes.body.user.phone, '+919811223344');
    assert.equal(widgetCustRes.body.user.fullName, 'Rohit Verma');
    assert.equal(widgetCustRes.body.user.authProvider, 'PHONE');

    // ── 10. Email Registration with Mobile Number ───────────────────────────
    const emailWithPhoneRes = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Simran Kaur',
        email: 'simran.kaur@example.com',
        phone: '9988776655',
        password: 'Passw0rd1!',
        accountType: 'CUSTOMER',
      });
    assert.equal(emailWithPhoneRes.status, 201);
    assert.equal(emailWithPhoneRes.body.user.phone, '+919988776655');

    // Now re-login via widget OTP for the same phone number -> matches existing user!
    const widgetMatchRes = await request(app)
      .post('/api/auth/otp/widget-verify')
      .send({
        accessToken: 'test:widget:+919988776655',
      });
    assert.equal(widgetMatchRes.status, 200);
    assert.equal(widgetMatchRes.body.user.email, 'simran.kaur@example.com');
    assert.equal(widgetMatchRes.body.user.id, emailWithPhoneRes.body.user.id);

    // ── 11. Existing CUSTOMER logging in as VENDOR via MSG91 OTP widget ────────
    // Auto-promotes user and creates VendorOrganization seamlessly
    const widgetVendorRes = await request(app)
      .post('/api/auth/otp/widget-verify')
      .send({
        accessToken: 'test:widget:+919988776655',
        accountType: 'VENDOR',
        businessName: 'Simran Cine Creations',
      });
    assert.equal(widgetVendorRes.status, 200);
    assert.equal(widgetVendorRes.body.user.accountType, 'VENDOR');
    assert.ok(widgetVendorRes.body.user.vendorOrganization);

    // Vendor profile access works immediately
    const vendorCheckRes = await request(app)
      .get('/api/vendor/profile')
      .set('Authorization', `Bearer ${widgetVendorRes.body.accessToken}`);
    assert.equal(vendorCheckRes.status, 200);
    assert.equal(vendorCheckRes.body.vendor.businessName, 'Simran Cine Creations');
  } finally {
    await disconnectDB();
    await mongod.stop();
  }
});
