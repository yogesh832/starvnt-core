import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationLanguage, localizeAuraQuestion, auraLanguageInstruction } from '../src/common/auraLanguage.js';
// Unmodified pre-Bengali module (git HEAD): Hindi/Hinglish/English behaviour must match it exactly.
import * as before from '../test-data/auraLanguage.head.js';
import { switchReply } from '../src/customer/aura/eventSwitch.js';
import { vendorTruthReply } from '../src/customer/aura/vendorTruth.js';
import { ttsModelFor } from '../src/external/services/voice.service.js';

const hist = (...lines) => lines.map((content, i) => ({ role: i % 2 ? 'model' : 'user', content }));

test('Bengali script, Roman Bengali and explicit requests select Bengali', () => {
  assert.equal(conversationLanguage('আমার বিয়ের জন্য ক্যাটারিং লাগবে'), 'bn');
  assert.equal(conversationLanguage('ami amar biye plan korte chai'), 'bn');
  assert.equal(conversationLanguage('please reply in bengali'), 'bn');
  assert.equal(conversationLanguage('bangla te bolun'), 'bn');
  assert.equal(conversationLanguage('12 December', hist('আমার বিয়ে আছে', 'কোন তারিখে?')), 'bn', 'short facts keep Bengali');
  assert.equal(conversationLanguage('ok now in english please', hist('আমার বিয়ে আছে', 'ঠিক আছে')), 'en', 'switching back to English still works');
  assert.match(auraLanguageInstruction('bn'), /Bengali in Bengali script/);
});

test('Hindi, Hinglish and English detection is unchanged', () => {
  const cases = [
    ['मुझे शादी के लिए कैटरिंग चाहिए', []],
    ['mujhe shaadi ke liye catering chahiye', []],
    ['I need a photographer for my wedding', []],
    ['haan', hist('mujhe shaadi plan karni hai', 'Kitne mehmaan?')],
    ['kapkote bazar ke paas', hist('mera event hai', 'kahan?')],
    ['can you help me plan a birthday', hist('मुझे मदद चाहिए', 'ज़रूर')],
    ['acha theek hai bolo', []],
    ['apni shaadi ke liye venue chahiye', []],
    ['in hindi please', []],
    ['hinglish mein baat karo', []],
  ];
  for (const [message, history] of cases) {
    assert.equal(conversationLanguage(message, history), before.conversationLanguage(message, history), message);
  }
});

test('next question and options are localised to Bengali; hi/hinglish/en output is identical to before', () => {
  const questions = [
    { topic: 'event.type', question: 'What kind of event are you planning?', options: [{ label: 'Wedding', message: 'Wedding' }, { label: 'Something else', prefill: 'My event: ' }] },
    { topic: 'event.budget', question: 'What is your budget?', options: [{ label: 'Set my own budget', prefill: 'My budget ₹' }, 'Skip for now'] },
    { topic: 'requirement.catering', question: 'Is catering arranged?', options: [{ label: 'Yes, I already have one', prefill: 'x' }, { label: 'Help me find one', message: 'help' }] },
    { topic: 'event.area', question: 'Which area?', options: [] },
  ];
  const event = { city: 'Kolkata', location: { venueName: 'Biswa Bangla' } };
  for (const q of questions) {
    for (const language of ['hi', 'hinglish', 'en']) {
      assert.deepEqual(localizeAuraQuestion(q, language, event), before.localizeAuraQuestion(q, language, event), `${q.topic} ${language}`);
    }
  }
  const bn = localizeAuraQuestion(questions[0], 'bn', event);
  assert.equal(bn.language, 'bn');
  assert.equal(bn.question, 'কী ধরনের অনুষ্ঠান পরিকল্পনা করতে চান?');
  assert.equal(bn.options[0].label, 'বিয়ে');
  assert.equal(bn.options[0].message, 'বিয়ে পরিকল্পনা করতে চাই।');
  const catering = localizeAuraQuestion(questions[2], 'bn', event);
  assert.equal(catering.question, 'ক্যাটারিং-এর ব্যবস্থা কি হয়ে গেছে?');
  assert.equal(localizeAuraQuestion(questions[1], 'bn').options[1], 'এখন থাক');
  assert.match(localizeAuraQuestion(questions[3], 'bn', event).question, /Biswa Bangla Kolkata/);
  assert.equal(localizeAuraQuestion(null, 'bn'), null);
});

test('fixed Aura sentences have Bengali versions', () => {
  assert.match(switchReply('bn', { title: 'বিয়ে' }, []), /পরিকল্পনা করছি/);
  assert.match(switchReply('bn', null, []), /কোনো ইভেন্ট পাওয়া যায়নি/);
  assert.match(vendorTruthReply([], { city: 'Kolkata' }, 'bn'), /সক্রিয় পরিষেবা পাওয়া যায়নি/);
  assert.match(switchReply('hi', { title: 'Shaadi' }, []), /प्लानिंग कर रही हूँ/, 'Hindi unchanged');
});

test('voice uses a Bengali-capable TTS model only for Bengali text', () => {
  const saved = { m: process.env.ELEVENLABS_TTS_MODEL, b: process.env.ELEVENLABS_TTS_MODEL_BN };
  delete process.env.ELEVENLABS_TTS_MODEL; delete process.env.ELEVENLABS_TTS_MODEL_BN;
  try {
    assert.equal(ttsModelFor('আপনার অনুষ্ঠান কোন তারিখে?'), 'eleven_v3');
    assert.equal(ttsModelFor('आपका इवेंट किस तारीख को है?'), 'eleven_multilingual_v2');
    assert.equal(ttsModelFor('Which date is your event?'), 'eleven_multilingual_v2');
    process.env.ELEVENLABS_TTS_MODEL_BN = 'custom_bn_model';
    assert.equal(ttsModelFor('ঠিক আছে'), 'custom_bn_model');
  } finally {
    if (saved.m === undefined) delete process.env.ELEVENLABS_TTS_MODEL; else process.env.ELEVENLABS_TTS_MODEL = saved.m;
    if (saved.b === undefined) delete process.env.ELEVENLABS_TTS_MODEL_BN; else process.env.ELEVENLABS_TTS_MODEL_BN = saved.b;
  }
});
