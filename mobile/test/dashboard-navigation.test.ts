import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StackActions, StackRouter } from '@react-navigation/routers';
import { dashboardSelection, dashboardTabs } from '../src/dashboardNavigation.ts';

test('all three dashboards expose only their own navigation destinations', () => {
  assert.deepEqual(dashboardTabs('customer').map(tab => tab.name), ['Overview', 'Events', 'AuraTab', 'Updates', 'Me']);
  assert.deepEqual(dashboardTabs('vendor').map(tab => tab.name), ['Overview', 'Work', 'AuraTab', 'Updates', 'Me']);
  assert.deepEqual(dashboardTabs('admin').map(tab => tab.name), ['Overview', 'CoreUpdates', 'Me']);
});
test('detail pages retain the correct active dashboard navigation item', () => {
  const state = (name: string, params?: any) => ({ index: 1, routes: [{ name: 'Main' }, { name, params }] });
  assert.equal(dashboardSelection('customer', state('Event')), 'Events');
  assert.equal(dashboardSelection('vendor', state('VendorBooking')), 'Work');
  assert.equal(dashboardSelection('admin', state('AdminRecord')), 'Overview');
  assert.equal(dashboardSelection('customer', state('Chat')), 'AuraTab');
  assert.equal(dashboardSelection('vendor', state('Chat', { kind: 'thread' })), 'Updates');
  assert.equal(dashboardSelection('customer', state('Profile')), 'Me');
});
test('bottom navigation pops back to the existing Main route instead of stacking another dashboard', () => {
  const router = StackRouter({ initialRouteName: 'Main' });
  const options = { routeNames: ['Main', 'Event', 'Checkout'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  state = router.getStateForAction(state, StackActions.push('Event', { eventId: 'event' }), options)!;
  state = router.getStateForAction(state, StackActions.push('Checkout'), options)!;
  state = router.getStateForAction(state, StackActions.popTo('Main', { screen: 'AuraTab' }), options)!;
  assert.equal(state.routes.length, 1); assert.equal(state.routes[0].name, 'Main');
  assert.equal(state.routes[0].params?.screen, 'AuraTab');
});
