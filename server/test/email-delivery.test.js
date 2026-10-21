import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

function fixture({smtpResult, smtpError, resendResult, resend = false} = {}) {
  const removed = [];
  const config = {resendApiKey: resend ? 'test-key' : '', resendSenderEmail: 'test@example.com', emailServerHost: 'smtp.test', emailServerPort: 587, emailServerUser: 'sender', emailServerPassword: 'private-test-password', emailFrom: 'sender@example.com'};
  const modules = {
    '../../config.js': {config},
    '../models/OtpVerification.js': {OtpVerification: {deleteMany: async query => removed.push(query), create: async () => ({_id:'challenge'})}},
    nodemailer: {createTransport: () => ({sendMail: async () => {if (smtpError) throw smtpError; return smtpResult;}})},
    resend: {Resend: class {emails = {send: async () => resendResult};}},
  };
  const code = transformSync(readFileSync(new URL('../src/external/services/emailOtp.service.js', import.meta.url),'utf8'),{format:'cjs',loader:'js'}).code;
  const module = {exports:{}};
  new Function('require','module','exports','console',code)(name => {assert.ok(modules[name],name);return modules[name];},module,module.exports,{error(){},log(){}});
  return {...module.exports,removed};
}

test('SMTP acknowledgement means accepted, never confirmed inbox delivery, and OTP stays private', async () => {
  const f=fixture({smtpResult:{accepted:['person@example.com'],rejected:[],messageId:'receipt-id'}});
  const result=await f.sendEmailOtp('person@example.com');
  assert.deepEqual(result.delivery,{provider:'smtp',status:'accepted',messageId:'receipt-id',inboxConfirmed:false});
  assert.match(result.message,/not yet confirmed/);
  assert.equal(result.otp,undefined);
});

test('rejected, pending or unacknowledged SMTP recipients never return success and invalidate the challenge', async () => {
  for (const smtpResult of [{accepted:[],rejected:['person@example.com']},{accepted:['someone-else@example.com']},{accepted:['person@example.com'],pending:['person@example.com']}]) {
    const f=fixture({smtpResult});
    await assert.rejects(f.sendEmailOtp('person@example.com'),/EMAIL_OTP_RECIPIENT_REJECTED/);
    assert.equal(f.removed.length,2);
  }
});

test('sender authentication and connectivity failures produce actionable error codes', async () => {
  for(const [code,expected] of [['EAUTH','SMTP_EMAIL_AUTH_FAILED'],['ETIMEDOUT','EMAIL_OTP_PROVIDER_UNAVAILABLE'],['ECONNECTION','EMAIL_OTP_PROVIDER_UNAVAILABLE']]) {
    const f=fixture({smtpError:Object.assign(new Error('provider failure'),{code})});
    await assert.rejects(f.sendEmailOtp('person@example.com'),new RegExp(expected));
    assert.equal(f.removed.length,2);
  }
});

test('Resend must acknowledge a message ID; rejected or empty responses are errors', async () => {
  for(const resendResult of [{data:null,error:{message:'sender rejected'}},{data:{},error:null}]) {
    const f=fixture({resend:true,resendResult});
    await assert.rejects(f.sendEmailOtp('person@example.com'),/RESEND_EMAIL_SEND_FAILED/);
    assert.equal(f.removed.length,2);
  }
  const f=fixture({resend:true,resendResult:{data:{id:'resend-receipt'},error:null}});
  assert.deepEqual((await f.sendEmailOtp('person@example.com')).delivery,{provider:'resend',status:'accepted',messageId:'resend-receipt',inboxConfirmed:false});
});
