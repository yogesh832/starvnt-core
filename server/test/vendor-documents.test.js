import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestApp } from './helpers.js';

test('Vendor Documents: Working KYC document upload, listing, and deletion with tenant isolation', async () => {
  const { app, mongod, disconnectDB } = await setupTestApp();

  try {
    // 1. Register a test vendor
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Aarav Mehta',
        businessName: 'Mehta Grand Decors',
        category: 'Decor & Styling',
        city: 'Mumbai',
        email: 'aarav@mehtadecor.com',
        password: 'Password123!',
      });

    assert.equal(regRes.status, 201);
    const token = regRes.body.accessToken;

    // 2. Initial state: vendor must have 0 documents
    const emptyDocsRes = await request(app)
      .get('/api/vendor/documents')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(emptyDocsRes.status, 200);
    assert.equal(emptyDocsRes.body.ok, true);
    assert.equal(emptyDocsRes.body.documents.length, 0, 'Initial documents list must be empty');

    // 3. Upload a GST certificate
    const createDocRes = await request(app)
      .post('/api/vendor/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'GST Certificate',
        type: 'GST',
        documentNumber: '27AABCU9603R1ZM',
        fileName: 'GST_Certificate_Mehta_Decors.pdf',
        fileSize: '1.4 MB',
        notes: 'Verified state tax registration document',
      });

    assert.equal(createDocRes.status, 201);
    assert.equal(createDocRes.body.ok, true);
    assert.equal(createDocRes.body.document.title, 'GST Certificate');
    assert.equal(createDocRes.body.document.type, 'GST');
    assert.equal(createDocRes.body.document.documentNumber, '27AABCU9603R1ZM');
    assert.equal(createDocRes.body.document.status, 'SUBMITTED');
    const docId = createDocRes.body.document._id;

    // 4. Upload a Bank Proof document
    const createBankDoc = await request(app)
      .post('/api/vendor/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bank Statement / Cancelled Cheque',
        type: 'BANK_PROOF',
        documentNumber: 'HDFC0001234',
        fileName: 'Cancelled_Cheque_HDFC.pdf',
        fileSize: '820 KB',
      });

    assert.equal(createBankDoc.status, 201);

    // 5. List documents — should contain 2 documents
    const listRes = await request(app)
      .get('/api/vendor/documents')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.documents.length, 2);

    // 6. Register a SECOND vendor for tenant isolation
    const reg2Res = await request(app)
      .post('/api/auth/register')
      .send({
        accountType: 'VENDOR',
        fullName: 'Rohit Sharma',
        businessName: 'Rohit Sound Systems',
        category: 'DJ & Music',
        city: 'Delhi',
        email: 'rohit@soundsystems.com',
        password: 'Password123!',
      });

    assert.equal(reg2Res.status, 201);
    const token2 = reg2Res.body.accessToken;

    // Second vendor must see 0 documents
    const list2Res = await request(app)
      .get('/api/vendor/documents')
      .set('Authorization', `Bearer ${token2}`);

    assert.equal(list2Res.status, 200);
    assert.equal(list2Res.body.documents.length, 0, 'Tenant isolation: Vendor 2 cannot see Vendor 1 documents');

    // Second vendor cannot delete Vendor 1's document
    const deleteByOther = await request(app)
      .delete(`/api/vendor/documents/${docId}`)
      .set('Authorization', `Bearer ${token2}`);

    assert.equal(deleteByOther.status, 404, 'Cannot delete other vendor document');

    // 7. First vendor can delete their document
    const deleteRes = await request(app)
      .delete(`/api/vendor/documents/${docId}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.ok, true);

    // Verify list is down to 1 document
    const finalList = await request(app)
      .get('/api/vendor/documents')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(finalList.body.documents.length, 1);
  } finally {
    await disconnectDB();
    await mongod.stop();
  }
});
