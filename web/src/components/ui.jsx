export function LogoMark({ size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoWord({ light = false, sub = 'Events. Simplified.', size = 'text-lg' }) {
  return (
    <div className={`flex items-center gap-2 ${light ? 'text-white' : 'text-primary'}`}>
      <LogoMark />
      <div>
        <div className={`font-extrabold tracking-tight leading-none ${size}`}>STARVNT</div>
        <div
          className={`text-[9px] leading-tight ${light ? 'text-white/60' : 'text-muted'}`}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

export function StatusChip({ status }) {
  const styles = {
    Active: 'bg-emerald-50 text-emerald-600',
    Verified: 'bg-emerald-50 text-emerald-600',
    Confirmed: 'bg-emerald-50 text-emerald-600',
    Completed: 'bg-emerald-50 text-emerald-600',
    Planning: 'bg-orange-50 text-orange-500',
    Pending: 'bg-orange-50 text-orange-500',
    Scheduled: 'bg-violet-50 text-violet-600',
    'In Progress': 'bg-violet-50 text-violet-600',
    Inactive: 'bg-orange-50 text-orange-500',
    Rejected: 'bg-red-50 text-red-500',
    New: 'bg-primary-soft text-primary',
    Interested: 'bg-sky-50 text-sky-600',
    'Hot lead': 'bg-red-50 text-red-500',
    Cancelled: 'bg-red-50 text-red-500',
    Disabled: 'bg-red-50 text-red-500',
    Draft: 'bg-gray-100 text-gray-500',
  };
  return (
    <span
      className={`inline-block text-[11px] font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap ${
        styles[status] || 'bg-gray-100 text-gray-500'
      }`}
    >
      {status}
    </span>
  );
}
