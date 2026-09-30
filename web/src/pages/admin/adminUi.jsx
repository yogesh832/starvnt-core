import Icon from '../../components/Icon.jsx';

const toneMap = {
  primary: 'bg-primary-soft text-primary',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function AdminPageHeader({
  eyebrow = 'STARVNT Core',
  title,
  description,
  meta,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onClearSearch,
  action,
}) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/90 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary/80">
            {eyebrow}
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-navy">{title}</h1>
            {meta ? (
              <span className="mb-1 rounded-full bg-lavender px-2.5 py-1 text-[11px] font-bold text-muted">
                {meta}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
          {onSearchChange ? (
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-slate-50 px-3.5 py-2 text-sm text-muted sm:w-80">
              <Icon name="search" size={15} />
              <input
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-navy outline-none placeholder:text-muted/70"
                placeholder={searchPlaceholder}
              />
              {searchValue ? (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="rounded-md px-1 text-xs font-bold text-muted hover:bg-white hover:text-navy"
                  title="Clear search"
                >
                  x
                </button>
              ) : null}
            </div>
          ) : null}
          {action}
        </div>
      </div>
    </section>
  );
}

export function AdminStatCard({ icon = 'reports', label, value, foot, tone = 'primary' }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneMap[tone] || toneMap.primary}`}>
          <Icon name={icon} size={18} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold text-navy">{value}</div>
          <div className="truncate text-[11px] font-medium text-muted">{label}</div>
        </div>
      </div>
      {foot ? <div className="mt-3 text-[11px] font-semibold text-emerald-600">{foot}</div> : null}
    </div>
  );
}

export function AdminTableSkeleton({ columns = 6, rows = 6 }) {
  return (
    <div className="p-4">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid animate-pulse gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(100px, 1fr))` }}>
            {Array.from({ length: columns }).map((__, colIndex) => (
              <div
                key={colIndex}
                className={`h-9 rounded-xl bg-slate-100 ${colIndex === 0 ? 'w-full' : 'w-11/12'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminEmptyState({ title = 'No records found', message, action }) {
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-lavender text-primary">
        <Icon name="search" size={20} />
      </div>
      <h3 className="mt-3 text-sm font-extrabold text-navy">{title}</h3>
      {message ? <p className="mt-1 max-w-md text-sm leading-6 text-muted">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminErrorState({ title = 'Could not load data', message, onRetry }) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-extrabold">{title}</div>
          <div className="mt-1 text-rose-600/90">{message || 'Please try again.'}</div>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-rose-700 shadow-sm hover:bg-rose-100"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
