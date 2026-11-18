export type DashboardWidget = { status: string; sources: string[]; lastSuccessfulSync: string | Date | null; measuredAt: string | Date; saved?: any };
export type DashboardSnapshot = { scope: string; periodKey: string; dashboard: any; view: any; widgets: Record<string, DashboardWidget> };
export const vendorDashboardWidgets: Record<string, { sources: string[]; cache: boolean; atomic?: boolean }>;
export function dashboardSnapshot(previous: DashboardSnapshot | null, dashboard: any, scope: string): DashboardSnapshot;
export function dashboardWidgetMessage(widget?: DashboardWidget, requestFailed?: boolean): string;
export function isVendorDashboard(value: unknown): boolean;
