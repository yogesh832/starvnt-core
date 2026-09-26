export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />;
}

export function SkeletonLine({ className = '' }) {
  return <SkeletonBlock className={`h-3 ${className}`} />;
}

export function MetricSkeleton({ count = 3 }) {
  return (
    <div className={`grid gap-3.5 ${count >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-white rounded-2xl shadow-xs border border-gray-100 p-4 flex items-center gap-3">
          <SkeletonBlock className="w-10 h-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="w-20 h-5" />
            <SkeletonLine className="w-28" />
            <SkeletonLine className="w-36 h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 3, compact = false }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-white rounded-2xl shadow-xs border border-gray-100 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <SkeletonBlock className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="w-2/3 h-4" />
              <SkeletonLine className="w-1/2" />
              {!compact && (
                <div className="grid sm:grid-cols-3 gap-2 pt-2">
                  <SkeletonLine className="h-8" />
                  <SkeletonLine className="h-8" />
                  <SkeletonLine className="h-8" />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 6, rows = 5, minWidth = 620 }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-xs bg-white">
      <table className="w-full text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {Array.from({ length: columns }).map((_, idx) => (
              <th key={idx} className="px-4 py-3">
                <SkeletonLine className="w-20 h-2.5" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row} className="border-b border-gray-50 last:border-0">
              {Array.from({ length: columns }).map((_, col) => (
                <td key={col} className="px-4 py-3">
                  <SkeletonLine className={col === 0 ? 'w-24 h-3.5' : 'w-20'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageLoadingSkeleton({ cards = 3 }) {
  return (
    <div className="space-y-4">
      <MetricSkeleton count={Math.min(3, Math.max(2, cards))} />
      <CardListSkeleton count={cards} />
    </div>
  );
}
