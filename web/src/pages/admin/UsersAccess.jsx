import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';

/**
 * Users & Access — SUPER_ADMIN only. List admins, create admins with an
 * explicit permission picker (grouped by resource), disable/enable.
 * Disable revokes sessions server-side.
 */
export default function UsersAccess() {
  const { admin: me } = useAdminAuth();
  const [admins, setAdmins] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null); // null | {mode:'create'} | {mode:'edit', admin}
  const [form, setForm] = useState({ fullName: '', email: '', password: '', permissions: [] });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [u, c] = await Promise.all([
      adminApi.call('/users'),
      adminApi.call('/permissions/catalog'),
    ]);
    setAdmins(u.admins);
    setCatalog(c.catalog);
  }

  useEffect(() => {
    load().catch((e) => setError(e.data?.error || 'Failed to load'));
  }, []);

  function openCreate() {
    setForm({ fullName: '', email: '', password: '', permissions: [] });
    setEditor({ mode: 'create' });
  }
  function openEdit(admin) {
    setForm({ ...admin, password: '', permissions: [...admin.permissions] });
    setEditor({ mode: 'edit', admin });
  }
  function togglePerm(p) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editor.mode === 'create') {
        await adminApi.call('/users', { method: 'POST', body: form });
      } else {
        await adminApi.call(`/users/${editor.admin.id}/permissions`, {
          method: 'PATCH',
          body: { permissions: form.permissions },
        });
      }
      setEditor(null);
      await load();
    } catch (err) {
      setError(err.data?.error || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(admin, action) {
    await adminApi.call(`/users/${admin.id}/${action}`, { method: 'POST', body: {} });
    await load();
  }

  const catalogGroups = useMemo(() => Object.entries(catalog), [catalog]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Users & Access</h1>
          <p className="text-sm text-muted">
            Only Super Admins manage internal access. Every change is audited.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2.5 transition"
        >
          + New Admin
        </button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-gray-100">
              <th className="px-5 py-3">Admin</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Permissions</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-gray-50">
                <td className="px-5 py-3">
                  <div className="font-semibold">{a.fullName}</div>
                  <div className="text-xs text-muted">{a.email}</div>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`text-[10px] font-bold uppercase rounded px-2 py-0.5 ${
                      a.role === 'SUPER_ADMIN' ? 'bg-navy text-white' : 'bg-primary-soft text-primary'
                    }`}
                  >
                    {a.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-muted">
                  {a.role === 'SUPER_ADMIN' ? 'ALL_PERMISSIONS' : `${a.permissions.length} granted`}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`text-xs font-semibold ${
                      a.status === 'ACTIVE' ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right space-x-2">
                  {a.role !== 'SUPER_ADMIN' && a.id !== me.id && (
                    <>
                      <button
                        onClick={() => openEdit(a)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Permissions
                      </button>
                      {a.status === 'ACTIVE' ? (
                        <button
                          onClick={() => setStatus(a, 'disable')}
                          className="text-xs font-semibold text-red-500 hover:underline"
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(a, 'enable')}
                          className="text-xs font-semibold text-green-600 hover:underline"
                        >
                          Enable
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 bg-navy/50 grid place-items-center p-4">
          <form
            onSubmit={save}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
          >
            <h2 className="text-lg font-bold">
              {editor.mode === 'create' ? 'Create Admin' : `Permissions — ${editor.admin.fullName}`}
            </h2>

            {editor.mode === 'create' && (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <input
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="Full name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
                <input
                  type="email"
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  placeholder="Work email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <input
                  type="password"
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm sm:col-span-2"
                  placeholder="Temporary password (8+ chars, letter + number)"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="mt-5 space-y-4">
              {catalogGroups.map(([resource, actions]) => (
                <div key={resource}>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">
                    {resource}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {actions.map((action) => {
                      const perm = `${resource}.${action}`;
                      const on = form.permissions.includes(perm);
                      return (
                        <button
                          type="button"
                          key={perm}
                          onClick={() => togglePerm(perm)}
                          className={`text-xs font-medium rounded-full px-3 py-1.5 transition ${
                            on
                              ? 'bg-primary text-white'
                              : 'bg-lavender text-ink/70 hover:bg-primary-soft'
                          }`}
                        >
                          {action}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="rounded-xl bg-primary hover:bg-primary-dark text-white px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
