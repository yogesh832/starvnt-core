type Workspace = 'customer' | 'vendor' | 'admin';
export type DashboardTab = { name: string; title: string; icon: string; activeIcon?: string };
export function dashboardTabs(workspace: Workspace): DashboardTab[] {
  if (workspace === 'admin') return [
    { name: 'Overview', title: 'Overview', icon: 'grid-outline', activeIcon: 'grid' },
    { name: 'CoreUpdates', title: 'Updates', icon: 'notifications-outline', activeIcon: 'notifications' },
    { name: 'Me', title: 'Account', icon: 'person-outline', activeIcon: 'person' },
  ];
  return [
    { name: 'Overview', title: workspace === 'vendor' ? 'Overview' : 'Home', icon: 'grid-outline', activeIcon: 'grid' },
    { name: workspace === 'vendor' ? 'Work' : 'Events', title: workspace === 'vendor' ? 'Workspace' : 'Events', icon: workspace === 'vendor' ? 'briefcase-outline' : 'calendar-outline', activeIcon: workspace === 'vendor' ? 'briefcase' : 'calendar' },
    { name: 'AuraTab', title: 'Aura+', icon: 'flash', activeIcon: 'flash' },
    { name: 'Updates', title: 'Updates', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
    { name: 'Me', title: workspace === 'vendor' ? 'Account' : 'Me', icon: 'person-outline', activeIcon: 'person' },
  ];
}
type Route = { name: string; params?: Record<string, any>; state?: NavState };
export type NavState = { index?: number; routes: readonly Route[] };
export function dashboardSelection(workspace: Workspace, state?: NavState): string {
  const route = state?.routes[state.index ?? 0];
  if (!route) return 'Overview';
  if (route.name === 'Main') return route.state?.routes[route.state.index ?? 0]?.name || 'Overview';
  if (['Profile', 'Library', 'NotificationSettings', 'VendorFinancial', 'VendorSetup', 'TestAuth'].includes(route.name)) return 'Me';
  if (route.name === 'AuraHistory' || (route.name === 'Chat' && !['thread', 'circle'].includes(route.params?.kind))) return workspace === 'admin' ? 'Overview' : 'AuraTab';
  if (route.name === 'Chat' || route.name === 'Circle') return workspace === 'admin' ? 'CoreUpdates' : 'Updates';
  if (workspace === 'admin') return 'Overview';
  if (workspace === 'vendor') return 'Work';
  return 'Events';
}
