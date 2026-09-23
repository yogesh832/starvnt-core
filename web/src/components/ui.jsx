export const BRAND_ASSETS = {
  mark: '/brand/starvnt-icon.png',
  wordmark: '/brand/starvnt-wordmark.jpg',
  full: '/brand/starvnt-core-logo.jpg',
};

export function LogoMark({ size = 22, className = '' }) {
  return (
    <img
      src={BRAND_ASSETS.mark}
      alt="StarVnt"
      width={size}
      height={size}
      className={`rounded-lg object-cover shadow-[0_0_20px_rgba(14,165,233,0.34)] ring-1 ring-cyan-300/35 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function LogoWord({
  light = false,
  sub = 'Events. Simplified.',
  size = 'text-xl',
  markSize = 34,
}) {
  return (
    <div className={`flex items-center gap-3 ${light ? 'text-white' : 'text-primary'}`}>
      <LogoMark size={markSize} />
      <div>
        <div
          className={`font-extrabold tracking-tight leading-none ${size} ${
            light
              ? 'text-white drop-shadow-[0_1px_10px_rgba(14,165,233,0.35)]'
              : 'bg-gradient-to-r from-primary via-[#2563eb] to-[#00a6ff] bg-clip-text text-transparent'
          }`}
        >
          StarVnt
        </div>
        <div
          className={`text-[9px] leading-tight font-semibold tracking-[0.18em] uppercase ${
            light ? 'text-white/70' : 'text-muted'
          }`}
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
