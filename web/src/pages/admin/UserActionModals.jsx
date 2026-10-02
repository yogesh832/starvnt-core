import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';

/**
 * Edit Modal for Vendor Organizations
 */
export function VendorEditModal({ vendor, isOpen, onClose, onSaved }) {
  const [form, setForm] = useState({
    businessName: '',
    category: '',
    phone: '',
    location: '',
    website: '',
    bio: '',
    status: 'ACTIVE',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (vendor) {
      setForm({
        businessName: vendor.businessName || '',
        category: vendor.category || '',
        phone: vendor.phone || vendor.owner?.phone || '',
        location: vendor.location || '',
        website: vendor.website || '',
        bio: vendor.bio || '',
        status: vendor.status || 'ACTIVE',
      });
      setError('');
    }
  }, [vendor]);

  if (!isOpen || !vendor) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.call(`/external-users/organizations/${vendor._id || vendor.id}`, {
        method: 'PATCH',
        body: form,
      });
      onSaved(res.organization || { ...vendor, ...form });
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to update vendor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="text-base font-extrabold text-navy">Edit Vendor Profile</h3>
            <p className="text-xs text-muted">Update organization details and operational status</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-sm flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Business Name *</label>
            <input
              type="text"
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-navy mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g. Photography, DJ, Catering"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-navy mb-1">Operating Location</label>
              <input
                type="text"
                placeholder="e.g. Mumbai, Maharashtra"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-navy mb-1">Phone Number</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-navy mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium bg-white"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="PENDING">PENDING</option>
                <option value="VERIFIED">VERIFIED</option>
                <option value="PROFILE_INCOMPLETE">PROFILE_INCOMPLETE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Website URL</label>
            <input
              type="url"
              placeholder="https://example.com"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Bio / Overview</label>
            <textarea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium resize-none"
            />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-ink/70 hover:bg-lavender rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary-dark transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Edit Modal for Customers
 */
export function CustomerEditModal({ customer, isOpen, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    status: 'ACTIVE',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (customer) {
      setForm({
        fullName: customer.fullName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        status: customer.status || 'ACTIVE',
      });
      setError('');
    }
  }, [customer]);

  if (!isOpen || !customer) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.call(`/external-users/customers/${customer._id || customer.id}`, {
        method: 'PATCH',
        body: form,
      });
      onSaved(res.customer || { ...customer, ...form });
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to update customer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="text-base font-extrabold text-navy">Edit Customer</h3>
            <p className="text-xs text-muted">Update profile information and account state</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Phone Number</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-navy font-medium bg-white"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-ink/70 hover:bg-lavender rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary-dark transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Restrict / Suspend for N Days Modal (Works for both Vendor and Customer)
 */
export function UserRestrictModal({ target, targetType = 'vendor', isOpen, onClose, onUpdated }) {
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState('');
  const [reason, setReason] = useState('Terms of service violation review');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !target) return null;

  const isAlreadyRestricted = target.isRestricted || target.status === 'SUSPENDED';
  const name = target.businessName || target.fullName || 'User';

  async function handleApply(selectedDays, customReason) {
    setLoading(true);
    setError('');
    try {
      const endpoint = targetType === 'vendor'
        ? `/external-users/organizations/${target._id || target.id}/restrict`
        : `/external-users/customers/${target._id || target.id}/restrict`;

      const res = await adminApi.call(endpoint, {
        method: 'POST',
        body: {
          days: selectedDays,
          reason: customReason || reason,
        },
      });

      onUpdated(res.organization || res.customer || {
        ...target,
        isRestricted: selectedDays > 0,
        status: selectedDays > 0 ? 'SUSPENDED' : 'ACTIVE',
        restrictedUntil: selectedDays > 0 ? new Date(Date.now() + selectedDays * 86400000).toISOString() : null,
        restrictionReason: selectedDays > 0 ? (customReason || reason) : '',
      });
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to update restriction');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 grid place-items-center">
              <Icon name="clock" size={17} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-navy">
                {isAlreadyRestricted ? 'Manage Suspension' : 'Restrict / Suspend Account'}
              </h3>
              <p className="text-xs text-muted">{name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold">
              {error}
            </div>
          )}

          {isAlreadyRestricted && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Currently Suspended
              </div>
              {target.restrictedUntil && (
                <div>Until: {new Date(target.restrictedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              )}
              {target.restrictionReason && (
                <div className="text-muted italic">Reason: &ldquo;{target.restrictionReason}&rdquo;</div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-navy mb-2">Duration (Days to suspend)</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDays(d); setCustomDays(''); }}
                  className={`py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                    days === d && !customDays
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'border-gray-200 text-ink/80 hover:bg-slate-50'
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted">Or custom:</span>
              <input
                type="number"
                min="1"
                max="365"
                placeholder="Custom days"
                value={customDays}
                onChange={(e) => {
                  setCustomDays(e.target.value);
                  if (e.target.value) setDays(parseInt(e.target.value, 10) || 0);
                }}
                className="w-32 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-navy focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <span className="text-xs text-muted">days</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-navy mb-1">Reason for Suspension</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Terms violation, dispute investigation, strict review"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-navy font-medium text-xs"
            />
          </div>

          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
            {isAlreadyRestricted ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleApply(0, 'Suspension lifted by Admin')}
                className="px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition cursor-pointer"
              >
                Lift Suspension Immediately
              </button>
            ) : <span />}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-3.5 py-2 text-xs font-bold text-ink/70 hover:bg-lavender rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || days <= 0}
                onClick={() => handleApply(days, reason)}
                className="px-4 py-2 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Applying...' : `Suspend for ${days} Days`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Flag / Unflag Modal
 */
export function UserFlagModal({ target, targetType = 'vendor', isOpen, onClose, onUpdated }) {
  const isFlagged = Boolean(target?.isFlagged);
  const [reason, setReason] = useState(target?.flagReason || 'Requires administrative review');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !target) return null;

  const name = target.businessName || target.fullName || 'User';

  async function handleToggle() {
    setLoading(true);
    setError('');
    try {
      const endpoint = targetType === 'vendor'
        ? `/external-users/organizations/${target._id || target.id}/flag`
        : `/external-users/customers/${target._id || target.id}/flag`;

      const nextFlag = !isFlagged;
      const res = await adminApi.call(endpoint, {
        method: 'POST',
        body: {
          isFlagged: nextFlag,
          reason: nextFlag ? reason : '',
        },
      });

      onUpdated(res.organization || res.customer || {
        ...target,
        isFlagged: nextFlag,
        flagReason: nextFlag ? reason : '',
        flaggedAt: nextFlag ? new Date().toISOString() : null,
      });
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to update flag state');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-rose-50/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl ${isFlagged ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'} grid place-items-center`}>
              <Icon name="flag" size={17} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-navy">
                {isFlagged ? 'Remove Account Flag' : 'Flag Account'}
              </h3>
              <p className="text-xs text-muted">{name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold">
              {error}
            </div>
          )}

          {isFlagged ? (
            <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Icon name="flag" size={13} className="text-rose-600" />
                This account is currently flagged
              </div>
              {target.flagReason && (
                <div className="text-muted">Reason: &ldquo;{target.flagReason}&rdquo;</div>
              )}
              <p className="text-ink/80 pt-1">
                Removing the flag will return this account to normal standing across the platform.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-navy mb-1">Reason for Flagging</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why this account is being flagged (e.g. suspicious behavior, complaints, incomplete profile)..."
                className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-navy font-medium text-xs resize-none"
              />
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-ink/70 hover:bg-lavender rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={loading || (!isFlagged && !reason.trim())}
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50 ${
                isFlagged ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {loading ? 'Processing...' : isFlagged ? 'Confirm Unflag' : 'Flag Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirm Delete Modal
 */
export function ConfirmDeleteModal({ target, targetType = 'vendor', isOpen, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !target) return null;

  const name = target.businessName || target.fullName || 'User';

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      const endpoint = targetType === 'vendor'
        ? `/external-users/organizations/${target._id || target.id}`
        : `/external-users/customers/${target._id || target.id}`;

      await adminApi.call(endpoint, { method: 'DELETE' });
      onDeleted(target._id || target.id);
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to delete record');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-rose-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 grid place-items-center">
              <Icon name="trash" size={17} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-navy">
                Delete {targetType === 'vendor' ? 'Vendor Organization' : 'Customer Account'}
              </h3>
              <p className="text-xs text-rose-600 font-medium">Permanent, irreversible action</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-lavender text-muted hover:text-navy cursor-pointer">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold">
              {error}
            </div>
          )}

          <p className="text-ink/80 text-xs leading-relaxed">
            Are you sure you want to permanently delete <strong className="text-navy">{name}</strong>?
            {targetType === 'vendor'
              ? ' This will detach the owner user and delete all uploaded documents for this organization.'
              : ' This customer account and their active sessions will be completely removed.'}
          </p>

          <div className="p-3 rounded-xl bg-slate-50 border border-gray-200 text-[11px] text-muted space-y-0.5">
            <div><strong>ID:</strong> {target._id || target.id}</div>
            {target.email && <div><strong>Email:</strong> {target.email}</div>}
            {target.category && <div><strong>Category:</strong> {target.category}</div>}
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-ink/70 hover:bg-lavender rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleDelete}
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
