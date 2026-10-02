import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import ModuleTable from './ModuleTable.jsx';
import { AdminEmptyState, AdminErrorState, AdminPageHeader, AdminTableSkeleton } from './adminUi.jsx';

/**
 * Users & Access — SUPER_ADMIN only.
 * Unified user access hub covering:
 * 1. Internal Admins (RBAC permissions, disable/enable, creation)
 * 2. Vendors (Organizations, approval, suspend/restrict, flag, edit, delete)
 * 3. Customers (Accounts, suspension, flag, edit, delete)
 */
export default function UsersAccess() {
  const { admin: me } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('type') || 'admins'; // 'admins' | 'vendors' | 'customers'

  const [admins, setAdmins] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null); // null | {mode:'create'} | {mode:'edit', admin}
  const [form, setForm] = useState({ fullName: '', email: '', password: '', permissions: [] });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [u, c] = await Promise.all([
        adminApi.call('/users'),
        adminApi.call('/permissions/catalog'),
      ]);
      setAdmins(u.admins || []);
      setCatalog(c.catalog || {});
    } catch (e) {
      setError(e.data?.error || 'Failed to load internal admins');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'admins') {
      load();
    }
  }, [activeTab]);

  function handleTabSwitch(type) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('type', type);
      return next;
    });
  }

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
    <div className="space-y-5">
      {/* Top Header */}
      <AdminPageHeader
        title="Users & Access"
        description="Comprehensive management of internal administrators, vendor partners, and customer accounts."
        meta={activeTab === 'admins' && admins.length ? `${admins.length} internal admins` : undefined}
        action={
          activeTab === 'admins' ? (
            <button
              onClick={openCreate}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2.5 transition cursor-pointer"
            >
              + New Admin
            </button>
          ) : undefined
        }
      />

      {/* Top Level Subview Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-gray-200/70">
          <button
            type="button"
            onClick={() => handleTabSwitch('admins')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'admins'
                ? 'bg-white text-navy shadow-sm'
                : 'text-ink/60 hover:text-navy'
            }`}
          >
            <Icon name="access" size={14} />
            <span>Internal Admins</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'admins' ? 'bg-primary-soft text-primary' : 'bg-gray-200 text-muted'
              }`}
            >
              {admins.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('vendors')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'vendors'
                ? 'bg-white text-navy shadow-sm'
                : 'text-ink/60 hover:text-navy'
            }`}
          >
            <Icon name="vendors" size={14} />
            <span>Vendors</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('customers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'customers'
                ? 'bg-white text-navy shadow-sm'
                : 'text-ink/60 hover:text-navy'
            }`}
          >
            <Icon name="customers" size={14} />
            <span>Customers</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {activeTab === 'vendors' && (
            <Link
              to="/admin/vendors"
              className="inline-flex items-center gap-1.5 text-primary hover:text-primary-dark font-bold hover:underline"
            >
              <span>Go to dedicated Vendors page</span>
              <Icon name="chevronRight" size={12} />
            </Link>
          )}
          {activeTab === 'customers' && (
            <Link
              to="/admin/customers"
              className="inline-flex items-center gap-1.5 text-primary hover:text-primary-dark font-bold hover:underline"
            >
              <span>Go to dedicated Customers page</span>
              <Icon name="chevronRight" size={12} />
            </Link>
          )}
        </div>
      </div>

      {/* Content depending on activeTab */}
      {activeTab === 'vendors' && (
        <ModuleTable kind="vendors" embedded={true} />
      )}

      {activeTab === 'customers' && (
        <ModuleTable kind="customers" embedded={true} />
      )}

      {activeTab === 'admins' && (
        <>
          {error && <AdminErrorState message={error} onRetry={load} />}

          {!error && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-white/80">
              {loading ? (
                <AdminTableSkeleton columns={5} rows={6} />
              ) : admins.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-gray-100 bg-slate-50/80">
                        <th className="px-5 py-3 font-extrabold">Admin</th>
                        <th className="px-5 py-3 font-extrabold">Role</th>
                        <th className="px-5 py-3 font-extrabold">Permissions</th>
                        <th className="px-5 py-3 font-extrabold">Status</th>
                        <th className="px-5 py-3 text-right font-extrabold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((a) => (
                        <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-lavender/40 transition">
                          <td className="px-5 py-3">
                            <div className="font-semibold text-navy">{a.fullName}</div>
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
                                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                                >
                                  Permissions
                                </button>
                                {a.status === 'ACTIVE' ? (
                                  <button
                                    onClick={() => setStatus(a, 'disable')}
                                    className="text-xs font-semibold text-red-500 hover:underline cursor-pointer"
                                  >
                                    Disable
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setStatus(a, 'enable')}
                                    className="text-xs font-semibold text-green-600 hover:underline cursor-pointer"
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
              ) : (
                <AdminEmptyState
                  title="No admins found"
                  message="Create an admin user to share controlled access with your team."
                />
              )}
            </div>
          )}

          {editor && (
            <div className="fixed inset-0 z-50 bg-navy/50 grid place-items-center p-4 backdrop-blur-sm animate-fade-in">
              <form
                onSubmit={save}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
              >
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <h2 className="text-lg font-bold text-navy">
                    {editor.mode === 'create' ? 'Create Admin' : `Permissions — ${editor.admin.fullName}`}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setEditor(null)}
                    className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy cursor-pointer"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>

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
                              className={`text-xs font-medium rounded-full px-3 py-1.5 transition cursor-pointer ${
                                on
                                  ? 'bg-primary text-white shadow-sm'
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

                <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditor(null)}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={busy}
                    className="rounded-xl bg-primary hover:bg-primary-dark text-white px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 cursor-pointer shadow-sm"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
