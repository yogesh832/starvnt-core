export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  to: string;
  category: string;
  tone: string;
  createdAt?: string;
}
export function loadAdminNotifications(
  can: (permission: string) => boolean,
  call: (path: string) => Promise<any>,
): Promise<{ items: AdminNotification[]; incomplete: boolean }>;
export function notificationReadKey(item: AdminNotification): string;
