// Fetch only sources this staff member can use. The APIs still enforce RBAC.
export async function loadAdminNotifications(can, call) {
  const sources = [
    ['vendors', can('vendors.approve'), '/external-users/organizations?limit=2&tab=Pending'],
    ['events', can('events.read'), '/events?limit=1&tab=Planning'],
    ['bookings', can('bookings.read') && (can('payments.approve') || can('execution.read')), '/operations/bookings?limit=1'],
    ['automation', can('automation.read'), '/automation/stats'],
    ['audit', can('audit.read'), '/audit?limit=20'],
  ].filter(([, allowed]) => allowed);
  const results = await Promise.allSettled(sources.map(([, , path]) => call(path)));
  const data = Object.fromEntries(sources.map(([key], i) => [key, results[i].status === 'fulfilled' ? results[i].value : null]));
  const items = [];
  const add = (id, count, title, body, to, category, tone = 'blue') => {
    if (Number(count) > 0) items.push({ id, title: `${count} ${title}`, body, to, category, tone });
  };
  add('vendor-kyc', data.vendors?.total, 'vendor KYC reviews pending',
    data.vendors?.organizations?.map((v) => v.businessName).filter(Boolean).join(', ') || 'Review vendor documents and verification.',
    '/admin/vendors?tab=Pending', 'Operations', 'amber');
  add('events-draft', data.events?.stats?.draft, 'draft events need follow-up',
    'Review customer requirements and help move their event plans forward.', '/admin/events?tab=Draft', 'Sales');
  add('events-planning', data.events?.stats?.planning, 'events in planning',
    'Follow up with customers and review their event requirements.', '/admin/events?tab=Planning', 'Sales');
  if (can('payments.approve')) add('pending-payments', data.bookings?.stats?.pendingPaymentCount, 'payments need verification',
    'Review payment status before execution continues.', '/admin/bookings?tab=Pending', 'Important', 'rose');
  if (can('execution.read')) add('execution', data.bookings?.stats?.inProgressCount, 'bookings in execution',
    'Review progress, completion evidence and outstanding issues.', '/admin/bookings?tab=In%20Progress', 'Operations');
  const stats = data.automation?.stats || {};
  add('automation-failed', Number(stats.failed || 0) + Number(stats.deadLetter || 0), 'failed automation jobs',
    'Inspect failed jobs and retry them if needed.', '/admin/automation?tab=Dead%20Letter', 'Important', 'rose');
  add('automation-pending', stats.pending, 'automation jobs queued',
    'Review queued platform updates.', '/admin/automation?tab=Pending', 'Operations', 'violet');
  for (const log of data.audit?.logs || []) {
    const important = /FAILED|DISABLE|PERMISSIONS_UPDATED/.test(log.action || '');
    const title = {
      ADMIN_CREATE: 'Staff account created', PERMISSIONS_UPDATED: 'Staff role or permissions changed',
      ADMIN_LOGIN_FAILED: 'Admin sign-in failed', ADMIN_LOGIN_SUCCESS: 'Admin signed in',
      ADMIN_DISABLE: 'Staff account disabled', ADMIN_ENABLE: 'Staff account enabled',
    }[log.action] || String(log.action || 'Admin activity').toLowerCase().replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase());
    const subject = log.toState?.email || log.targetId;
    const role = log.toState?.roleKey?.toLowerCase().replaceAll('_', ' ');
    const detail = log.action === 'ADMIN_CREATE' || log.action === 'PERMISSIONS_UPDATED'
      ? [subject, role].filter(Boolean).join(' · ') : '';
    items.push({ id: `audit-${log._id}`, title, body: [detail, log.actorEmail].filter(Boolean).join(' · ') || 'Platform activity',
      createdAt: log.createdAt, to: '/admin/audit', category: important ? 'Important' : 'Activity', tone: important ? 'rose' : 'slate' });
  }
  return { items, incomplete: results.some((r) => r.status === 'rejected') };
}

// Include the summary so a changed queue is unread again, even with the same ID.
export function notificationReadKey(item) {
  return JSON.stringify([item.id, item.title, item.body]);
}
