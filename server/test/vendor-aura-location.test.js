import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {vendorCopy,describeVendorAction,requestsVendorLocation,normalizeVendorLocation,isVendorLocationSetupRequest} from '../src/common/vendorAuraUi.js';
import {chat,nextStepText,setupFallback} from '../src/external/aura/vendorAura.service.js';
import {VendorAuraSession,VendorAuraMessage} from '../src/external/models/VendorAura.js';

const point={address:'QA Market Road',city:'Kapkote',state:'Uttarakhand',postalCode:'263632',coordinates:{lat:29.9402,lng:79.9024}};

test('location questions expose a map, not price or coverage-radius questions',()=>{
  for(const language of ['en','hi','hinglish','bn']) assert.equal(requestsVendorLocation(vendorCopy(language,'locationQuestion')),true,language);
  assert.equal(requestsVendorLocation('Main aapki madad kar sakti hoon. Aapke business ka operating address ya area aur city kya hai?'),true);
  assert.equal(requestsVendorLocation('What is your starting base price?'),false);
  assert.equal(requestsVendorLocation('How far in km do you travel?'),false);
});
test('map coordinates require a real user selection and complete address, with no default fabricated city',()=>{
  assert.equal(normalizeVendorLocation(null),null);
  assert.equal(normalizeVendorLocation({...point,city:''}),null);
  for(const lat of [NaN,Infinity,91,'29.94']) assert.equal(normalizeVendorLocation({...point,coordinates:{lat,lng:79}}),null);
  assert.deepEqual(normalizeVendorLocation(point).coordinates,point.coordinates);
  assert.equal(normalizeVendorLocation({...point,state:''}).state,'');
});
test('Hindi and Hinglish confirmations and next questions keep their script after a saved service',()=>{
  const activation={checklist:{profile:true,services:true,capabilities:false,locations:false,coverage:false,portfolio:false}};
  assert.match(nextStepText(activation,{},'hinglish').text,/team mein kitne/);
  assert.doesNotMatch(nextStepText(activation,{},'hinglish').text,/[\u0900-\u097f]/);
  assert.match(nextStepText(activation,{},'hi').text,/टीम/);
  const service={kind:'service',service:{name:'Tent House',category:'Other: tentHouse',basePrice:30000,pricingType:'FIXED'}};
  assert.match(describeVendorAction(service,'hinglish'),/Tent House.*30,000 har event/);
  assert.match(vendorCopy('hinglish','confirm'),/Kya main.*haan/);
});
test('selecting a pin creates a tenant-owned pending proposal without writing an operating location',async t=>{
  const sid='qa-location-12345678';let update;let messages;
  t.mock.method(VendorAuraSession,'findById',()=>({lean:async()=>({_id:sid,vendor:'vendor-a',language:'hinglish'})}));
  t.mock.method(VendorAuraMessage,'find',()=>({sort(){return this;},limit(){return this;},lean:async()=>[]}));
  t.mock.method(VendorAuraMessage,'insertMany',async rows=>{messages=rows;});
  t.mock.method(VendorAuraSession,'updateOne',async(_filter,value)=>{update=value.$set;});
  const result=await chat({vendor:{_id:'vendor-a'},user:{_id:'user-a'},sessionId:sid,message:'Yeh location use karein: QA Market Road, Kapkote',locationSelection:point});
  assert.equal(result.pending.kind,'location');
  assert.equal(result.profileUpdated,false);
  assert.deepEqual(update.pending.location.coordinates,point.coordinates);
  assert.equal(update.language,'hinglish');
  assert.match(messages[1].content,/Kya main ise save/);
  assert.equal(result.reply.includes('Shall I'),false);
});
test('confirmed map selection persists the exact chosen pin and state instead of 0,0 or an invented state',async()=>{
  const url=new URL('../src/external/aura/setupActions.js',import.meta.url);
  const source=readFileSync(url,'utf8');const modules={};let created;
  for(const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) modules[match[1]]=await import(new URL(match[1],url));
  modules['../models/OperatingLocation.js']={OperatingLocation:{countDocuments:async()=>0,create:async row=>{created=row;return row;}}};
  modules['../services/vendorActivation.service.js']={evaluateVendorActivation:async()=>({checklist:{locations:true}})};
  const module={exports:{}};const code=transformSync(source,{format:'cjs',loader:'js'}).code;
  new Function('require','module','exports',code)(name=>modules[name],module,module.exports);
  await module.exports.executeAction({_id:'vendor-a',businessName:'QA',category:'Tent',save:async()=>{}},{kind:'location',location:normalizeVendorLocation(point)});
  assert.equal(created.vendor,'vendor-a');
  assert.deepEqual(created.coordinates,point.coordinates);
  assert.equal(created.state,'Uttarakhand');
});

test('localized provider fallback keeps verified settlement amounts without inventing missing ones',()=>{
  const result=setupFallback('Mera settlement kya hai?',{}, {settlements:{settledAmount:45000,pendingSettlementAmount:null}}, null,'hinglish');
  assert.match(result.reply,/Kul settlement: ₹45,000/);
  assert.doesNotMatch(result.reply,/Baaki settlement|₹0|[\u0900-\u097f]/);
});

test('explicit location setup requests offer the inline picker directly instead of redirecting through the model',async t=>{
  assert.equal(isVendorLocationSetupRequest('How do I set my location and coverage area?'),true);
  assert.equal(isVendorLocationSetupRequest('Mujhe apni location set karni hai. Address aur city map par chunna hai.'),true);
  assert.equal(isVendorLocationSetupRequest('What is my saved location?'),false);
  const sid='qa-location-direct123';let persisted;
  t.mock.method(VendorAuraSession,'findById',()=>({lean:async()=>({_id:sid,vendor:'vendor-a',language:'hinglish',pending:{kind:'location',location:normalizeVendorLocation(point)}})}));
  t.mock.method(VendorAuraMessage,'find',()=>({sort(){return this;},limit(){return this;},lean:async()=>[]}));
  t.mock.method(VendorAuraMessage,'insertMany',async()=>{});
  t.mock.method(VendorAuraSession,'updateOne',async(_filter,value)=>{persisted=value.$set;});
  const result=await chat({vendor:{_id:'vendor-a'},user:{_id:'user-a'},sessionId:sid,message:'Mujhe apni location set karni hai'});
  assert.equal(result.reply,vendorCopy('hinglish','locationQuestion'));
  assert.equal(requestsVendorLocation(result.reply),true);
  assert.equal(persisted.pending,null);
});
