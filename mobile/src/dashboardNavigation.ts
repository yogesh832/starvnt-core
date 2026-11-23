type Workspace = 'customer' | 'vendor' | 'admin';
export type DashboardTab = { name: string; title: string; icon: string; activeIcon?: string };
export function dashboardTabs(workspace: Workspace): DashboardTab[] {
  if (workspace === 'admin') return [
    { name: 'Overview', title: 'Overview', icon: 'grid-outline', activeIcon: 'grid' },
    { name: 'CoreUpdates', title: 'Updates', icon: 'notifications-outline', activeIcon: 'notifications' },
    { name: 'Me', title: 'Account', icon: 'person-outline', activeIcon: 'person' },
  ];
  if (workspace === 'vendor') return [
    { name: 'Overview', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { name: 'VendorLeads', title: 'Leads', icon: 'chatbox-ellipses-outline', activeIcon: 'chatbox-ellipses' },
    { name: 'VendorQuotes', title: 'Quotes', icon: 'document-text-outline', activeIcon: 'document-text' },
    { name: 'AuraTab', title: 'Aura+', icon: 'flash', activeIcon: 'flash' },
    { name: 'Work', title: 'More', icon: 'grid-outline', activeIcon: 'grid' },
  ];
  return [
    { name: 'Overview', title: 'Home', icon: 'grid-outline', activeIcon: 'grid' },
    { name: 'Events', title: 'Events', icon: 'calendar-outline', activeIcon: 'calendar' },
    { name: 'AuraTab', title: 'Aura+', icon: 'flash', activeIcon: 'flash' },
    { name: 'Updates', title: 'Updates', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
    { name: 'Me', title: 'Me', icon: 'person-outline', activeIcon: 'person' },
  ];
}
type Route = { name: string; params?: Record<string, any>; state?: NavState };
export type NavState = { index?: number; routes: readonly Route[] };
export function dashboardSelection(workspace: Workspace, state?: NavState): string {
  const route = state?.routes[state.index ?? 0];
  if (!route) return 'Overview';
  if (route.name === 'Main') {
    const tab = route.state?.routes[route.state.index ?? 0]?.name || 'Overview';
    return workspace === 'vendor' && ['Me', 'Updates'].includes(tab) ? 'Work' : tab;
  }
  if (workspace === 'vendor' && route.name === 'VendorModule' && route.params?.module === 'enquiries') return 'VendorLeads';
  if (workspace === 'vendor' && (route.name === 'VendorQuote' || (route.name === 'VendorModule' && route.params?.module === 'quotes') || (route.name === 'VendorForm' && route.params?.kind === 'quote'))) return 'VendorQuotes';
  if (['Profile', 'Library', 'NotificationSettings', 'VendorFinancial', 'VendorSetup', 'VendorSocialLinks', 'TestAuth'].includes(route.name)) return workspace === 'vendor' ? 'Work' : 'Me';
  if (route.name === 'AuraHistory' || (route.name === 'Chat' && !['thread', 'circle'].includes(route.params?.kind))) return workspace === 'admin' ? 'Overview' : 'AuraTab';
  if (route.name === 'Chat' || route.name === 'Circle') return workspace === 'admin' ? 'CoreUpdates' : workspace === 'vendor' ? 'Work' : 'Updates';
  if (workspace === 'admin') return 'Overview';
  if (workspace === 'vendor') return 'Work';
  return 'Events';
}
