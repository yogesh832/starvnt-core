/** Shared page scaffolding for Vendor OS sections. */
export function Page({ title, sub, action, children }) {
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl w-full overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{title}</h1>
          {sub && <p className="text-sm text-muted mt-0.5 line-clamp-2">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, extra, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-5 shadow-sm overflow-hidden ${className}`}>
      {(title || extra) && (
        <div className="flex items-center justify-between mb-3 gap-2">
          {title && <h2 className="font-bold text-[15px] truncate">{title}</h2>}
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyHint({ text }) {
  return (
    <div className="text-xs text-muted/80 bg-lavender rounded-xl px-4 py-3 border border-dashed border-gray-200">
      {text}
    </div>
  );
}
