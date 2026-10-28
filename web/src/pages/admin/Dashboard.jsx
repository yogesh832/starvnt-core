import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { AdminEmptyState, AdminPageHeader, AdminStatCard } from './adminUi.jsx';

const EVENT_STATUS_META = [
  { key: 'draft', label: 'Draft', color: '#64748b' },
  { key: 'planning', label: 'Planning', color: '#5a4bd1' },
  { key: 'booked', label: 'Booked', color: '#22c55e' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#0ea5e9' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];

function BookingsTrend({ bookings = [] }) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 4 }, (_, i) => {
    const from = new Date(start);
    from.setDate(start.getDate() + i * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from, to, count: 0 };
  });
  for (const booking of bookings) {
    const d = new Date(booking.createdAt || booking.updatedAt || booking.eventDate);
    if (Number.isNaN(d.getTime()) || d < start || d > now) continue;
    const idx = Math.min(3, Math.floor((d - start) / (7 * 24 * 60 * 60 * 1000)));
    buckets[idx].count += 1;
  }
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const points = buckets.map((b, i) => {
    const x = i * (400 / (buckets.length - 1));
    const y = 120 - (b.count / max) * 90;
    return `${x},${y}`;
  }).join(' ');
  const labels = buckets.map((b) => b.from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-white/80">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[15px]">Bookings Trend</h2>
        <span className="text-[11px] text-muted bg-lavender rounded-lg px-2 py-1">Last 30 Days</span>
      </div>
      <svg viewBox="0 0 400 140" className="mt-4 w-full">
        {[35, 70, 105].map((y) => (
          <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#eef0f8" strokeWidth="1" />
        ))}
        <polyline
          points={points}
          fill="none" stroke="#5a4bd1" strokeWidth="2.5" strokeLinecap="round"
        />
        <polyline
          points={`${points} 400,140 0,140`}
          fill="url(#trend)" stroke="none"
        />
        <defs>
          <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a4bd1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#5a4bd1" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}

function EventsDonut({ stats = {} }) {
  // Build donut segments with stroke-dasharray on circles.
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const total = Number(stats.total || 0);
  const segments = EVENT_STATUS_META.map((s) => {
    const count = Number(stats[s.key] || 0);
    return { ...s, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-white/80">
      <h2 className="font-bold text-[15px]">Events by Status</h2>
      <div className="flex items-center gap-6 mt-4">
        <div className="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
            {segments.map((s) => {
              const dash = (s.pct / 100) * C;
              const el = (
                <circle
                  key={s.label}
                  cx="70" cy="70" r={R} fill="none"
                  stroke={s.color} strokeWidth="16"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-xl font-extrabold">{total}</div>
              <div className="text-[9px] text-muted">Events</div>
            </div>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs flex-1">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-ink/80">{s.label}</span>
              <span className="ml-auto font-semibold">{s.count} · {s.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { admin, can } = useAdminAuth();
  const accessKey = JSON.stringify([admin?.id, admin?.role, admin?.permissions]);
  const [summary, setSummary] = useState({
    stats: [
      { label: 'Total Customers', value: '0', delta: 'Live count', icon: 'customers' },
      { label: 'Total Vendors', value: '0', delta: 'Live count', icon: 'vendors' },
      { label: 'Active Events', value: '0', delta: 'Planning + booked', icon: 'events' },
      { label: 'GMV (Total Bookings)', value: '₹0', delta: 'Booked value', icon: 'wallet' },
    ],
    activities: [],
    attention: [],
    eventStats: { total: 0 },
    bookings: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    Promise.allSettled([
      can('customers.read') ? adminApi.call('/external-users/customers?limit=1') : Promise.resolve(null),
      can('vendors.read') ? adminApi.call('/external-users/organizations?limit=1') : Promise.resolve(null),
      can('events.read') ? adminApi.call('/events?limit=50') : Promise.resolve(null),
      (can('bookings.read') || can('operations.read')) ? adminApi.call('/operations/bookings?limit=100') : Promise.resolve(null),
      can('audit.read') ? adminApi.call('/audit?limit=5') : Promise.resolve(null),
      can('vendors.read') ? adminApi.call('/external-users/organizations?limit=1&tab=Pending') : Promise.resolve(null),
    ])
      .then((results) => {
        if (!alive) return;
        const [customers, vendors, events, bookings, audit, pendingVendorQueue] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
        const customerCount = customers?.total ?? customers?.count ?? customers?.customers?.length ?? 0;
        const vendorCount = vendors?.total ?? vendors?.count ?? vendors?.organizations?.length ?? 0;
        const eventStats = events?.stats || { total: 0 };
        const eventRows = events?.events || [];
        const eventCount = events?.total ?? eventStats.total ?? events?.count ?? eventRows.length;
        const activeEventCount =
          Number(eventStats.planning || 0) + Number(eventStats.booked || 0) + Number(eventStats.in_progress || 0);
        const bookingStats = bookings?.stats || {};
        const gmv = Number(bookingStats.totalGmv || 0);
        const pendingVendors = pendingVendorQueue?.total || 0;
        const pendingPayments = Number(bookingStats.pendingPaymentCount || 0);
        const inProgress = Number(bookingStats.inProgressCount || 0);

        const attention = [
          pendingVendors ? `${pendingVendors} vendor verification${pendingVendors === 1 ? '' : 's'} need review` : null,
          pendingPayments ? `${pendingPayments} booking payment${pendingPayments === 1 ? '' : 's'} need verification` : null,
          inProgress ? `${inProgress} booking${inProgress === 1 ? '' : 's'} in execution` : null,
        ].filter(Boolean);

        setSummary({
          stats: [
            { label: 'Total Customers', value: customers ? customerCount.toLocaleString('en-IN') : '—', delta: can('customers.read') ? customers ? 'Live count' : 'Unavailable' : 'Not available for this role', icon: 'customers' },
            { label: 'Total Vendors', value: vendors ? vendorCount.toLocaleString('en-IN') : '—', delta: can('vendors.read') ? vendors ? 'Live count' : 'Unavailable' : 'Not available for this role', icon: 'vendors' },
            { label: 'Active Events', value: events ? activeEventCount.toLocaleString('en-IN') : '—', delta: can('events.read') ? events ? `${eventCount.toLocaleString('en-IN')} total` : 'Unavailable' : 'Not available for this role', icon: 'events' },
            { label: 'GMV (Total Bookings)', value: bookings ? `₹${gmv.toLocaleString('en-IN')}` : '—', delta: (can('bookings.read') || can('operations.read')) ? bookings ? `${bookingStats.totalBookings || 0} bookings` : 'Unavailable' : 'Not available for this role', icon: 'wallet' },
          ],
          activities: audit?.logs || [],
          attention,
          eventStats,
          bookings: bookings?.bookings || [],
        });

        if (results.some((r) => r.status === 'rejected')) {
          setError('Some dashboard data could not be loaded.');
        }
      })
      .catch(() => {
        if (alive) setError('Failed to load admin dashboard data.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [accessKey]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`Good morning, ${admin.fullName.split(' ')[0]}`}
        description="Here's what's happening across STARVNT today."
        meta={today}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {summary.stats.map((s) => (
          <AdminStatCard key={s.label} icon={s.icon} value={s.value} label={s.label} foot={s.delta} />
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {(can('bookings.read') || can('operations.read')) ? <BookingsTrend bookings={summary.bookings} /> : <AdminEmptyState title="Booking access is restricted" message="This role does not include booking access." />}
        {can('events.read') ? <EventsDonut stats={summary.eventStats} /> : <AdminEmptyState title="Event access is restricted" message="This role does not include event access." />}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-white/80">
          <h2 className="font-bold text-[15px] mb-3">Recent Activities</h2>
          {loading ? (
            <div className="text-xs text-muted">Loading recent admin activity...</div>
          ) : summary.activities.length > 0 ? (
            <ul className="space-y-3">
              {summary.activities.map((a) => (
                <li key={a._id} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full grid place-items-center shrink-0 bg-lavender text-primary">
                    <Icon name="audit" size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.action || 'Admin action'}</div>
                    <div className="text-[11px] text-muted">{a.actorEmail || 'System'} · {a.createdAt ? new Date(a.createdAt).toLocaleString() : 'Just now'}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <AdminEmptyState title="No recent activities" message="New admin actions, booking updates, and verification changes will appear here." />
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-white/80">
          <h2 className="font-bold text-[15px] mb-3">Needs Attention</h2>
          {loading ? (
            <div className="text-xs text-muted">Checking platform queues...</div>
          ) : summary.attention.length > 0 ? (
            <ul className="space-y-2.5">
              {summary.attention.map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-5 h-5 rounded-full bg-red-50 text-red-500 grid place-items-center text-[10px] font-bold">!</span>
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <AdminEmptyState title="Everything is clear" message="Pending verifications, disputes, and operational alerts will be listed here." />
          )}
        </div>
      </div>
    </div>
  );
}
