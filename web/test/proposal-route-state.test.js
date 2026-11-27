import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalRouteContext, resolveEventProposal } from '../src/pages/customer/proposalRouteState.js';
const proposal = '507f1f77bcf86cd799439011', event = '507f191e810c19729de860ea';
const list = [{ proposalId: proposal, eventId: event }];
test('newly generated ObjectId proposal URLs open that proposal directly', () => {
  assert.deepEqual(proposalRouteContext(`/customer/proposals/${proposal}`, {id:proposal}), {proposalId:proposal,targetEventId:null});
});
test('event-scoped and event-query URLs resolve to the proposal belonging to that event', () => {
  for (const context of [proposalRouteContext(`/customer/events/${event}/proposals`,{id:event}), proposalRouteContext('/customer/proposals',{eventParam:event})]) {
    assert.equal(resolveEventProposal(context,list).proposalId,proposal);
    assert.equal(resolveEventProposal(context,list).targetEventId,event);
  }
});
test('an unrelated event must not fall back to another events proposal', () => {
  const context=proposalRouteContext('/customer/events/another/proposals',{id:'another'});
  assert.equal(resolveEventProposal(context,list).proposalId,null);
  assert.equal(resolveEventProposal(context,list).targetEventId,'another');
});
test('explicit proposal queries and unfiltered proposal lists retain their intended destinations', () => {
  assert.equal(proposalRouteContext('/customer/proposals',{proposalParam:proposal,eventParam:event}).proposalId,proposal);
  assert.equal(resolveEventProposal(proposalRouteContext('/customer/proposals'),list).proposalId,proposal);
  assert.equal(resolveEventProposal(proposalRouteContext('/customer/proposals'),[]).proposalId,null);
});
