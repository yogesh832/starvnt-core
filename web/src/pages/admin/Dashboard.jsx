import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { AdminEmptyState, AdminPageHeader, AdminStatCard } from './adminUi.jsx';

const STATS = [
  { label: 'Total Customers', value: '0', delta: '0% this month', icon: 'customers', iconBg: 'bg-primary-soft text-primary' },
  { label: 'Total Vendors', value: '0', delta: '0% this month', icon: 'vendors', iconBg: 'bg-sky-50 text-sky-600' },
  { label: 'Active Events', value: '0', delta: '0% this month', icon: 'events', iconBg: 'bg-orange-50 text-orange-500' },
  { label: 'GMV (Total Bookings)', value: '₹0', delta: '0% this month', icon: 'wallet', iconBg: 'bg-emerald-50 text-emerald-600' },
];

const ACTIVITIES = [];

const ATTENTION = [];

const DONUT = [
  { label: 'Planning', pct: 0, color: '#5a4bd1' },
  { label: 'Confirmed', pct: 0, color: '#22c55e' },
  { label: 'In Progress', pct: 0, color: '#f59e0b' },
  { label: 'Completed', pct: 0, color: '#0ea5e9' },
  { label: 'Cancelled', pct: 0, color: '#ef4444' },
];

function BookingsTrend() {
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
          points="0,110 40,95 80,100 120,80 160,88 200,65 240,72 280,50 320,58 360,38 400,45"
          fill="none" stroke="#5a4bd1" strokeWidth="2.5" strokeLinecap="round"
        />
        <polyline
          points="0,110 40,95 80,100 120,80 160,88 200,65 240,72 280,50 320,58 360,38 400,45 400,140 0,140"
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
        <span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span>
      </div>
    </div>
  );
}

function EventsDonut() {
  // Build donut segments with stroke-dasharray on circles.
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-white/80">
      <h2 className="font-bold text-[15px]">Events by Status</h2>
      <div className="flex items-center gap-6 mt-4">
        <div className="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
            {DONUT.map((s) => {
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
              <div className="text-xl font-extrabold">0</div>
              <div className="text-[9px] text-muted">Events</div>
            </div>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs flex-1">
          {DONUT.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-ink/80">{s.label}</span>
              <span className="ml-auto font-semibold">{s.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { admin } = useAdminAuth();
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`Good morning, ${admin.fullName.split(' ')[0]}`}
        description="Here's what's happening across STARVNT today."
        meta={today}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {STATS.map((s) => (
          <AdminStatCard key={s.label} icon={s.icon} value={s.value} label={s.label} foot={s.delta} />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <BookingsTrend />
        <EventsDonut />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-white/80">
          <h2 className="font-bold text-[15px] mb-3">Recent Activities</h2>
          {ACTIVITIES.length > 0 ? (
            <ul className="space-y-3">
              {ACTIVITIES.map((a, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${a.cls}`}>
                    <Icon name={a.icon} size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.text}</div>
                    <div className="text-[11px] text-muted">{a.ago}</div>
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
          {ATTENTION.length > 0 ? (
            <ul className="space-y-2.5">
              {ATTENTION.map((t) => (
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
