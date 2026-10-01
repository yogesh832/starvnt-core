import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { AdminEmptyState, AdminErrorState, AdminPageHeader, AdminTableSkeleton } from './adminUi.jsx';

/** Audit Logs — immutable record of admin activity across the Core. */
export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');
    adminApi
      .call('/audit?limit=100')
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(e.data?.error || 'Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Audit Logs"
        description="Track who changed what, when it happened, the reason, and the request source."
        meta={logs.length ? `${logs.length} entries` : undefined}
      />

      {error ? <AdminErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} /> : null}

      {!error && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-white/80">
          {loading ? (
            <AdminTableSkeleton columns={6} rows={7} />
          ) : logs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-gray-100 bg-slate-50/80">
                    <th className="px-5 py-3">When</th>
                    <th className="px-5 py-3">Actor</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Target</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l._id} className="border-b border-gray-50 align-top last:border-0 hover:bg-lavender/40">
                      <td className="px-5 py-3 text-xs text-muted whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-navy">{l.actorEmail || '-'}</td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-lavender rounded px-2 py-1">
                          {l.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">
                        {l.targetType ? `${l.targetType} ${l.targetId?.slice(-6) || ''}` : '-'}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">{l.reason || '-'}</td>
                      <td className="px-5 py-3 text-xs text-muted">{l.ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <AdminEmptyState title="No audit entries yet" message="Admin actions will appear here once the team starts changing records." />
          )}
        </div>
      )}
    </div>
  );
}
