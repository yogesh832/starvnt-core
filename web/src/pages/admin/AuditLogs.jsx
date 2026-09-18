import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';

/** Audit Logs — immutable record of admin activity across the Core. */
export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .call('/audit?limit=100')
      .then((d) => setLogs(d.logs))
      .catch((e) => setError(e.data?.error || 'Failed to load audit logs'));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted">
          WHO · WHAT · WHEN · state changes · reason · source · IP/device.
        </p>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-gray-100">
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
              <tr key={l._id} className="border-b border-gray-50 align-top">
                <td className="px-5 py-3 text-xs text-muted whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="px-5 py-3 text-xs">{l.actorEmail || '—'}</td>
                <td className="px-5 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-lavender rounded px-2 py-1">
                    {l.action}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-muted">
                  {l.targetType ? `${l.targetType} ${l.targetId?.slice(-6) || ''}` : '—'}
                </td>
                <td className="px-5 py-3 text-xs text-muted">{l.reason || '—'}</td>
                <td className="px-5 py-3 text-xs text-muted">{l.ip || '—'}</td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan="6" className="px-5 py-8 text-center text-sm text-muted">
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
