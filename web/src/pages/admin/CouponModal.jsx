import { useState } from 'react';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';

export default function CouponModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    minOrderAmount: '0',
    maxDiscountAmount: '',
    validUntil: '',
    usageLimit: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.code.trim()) return setError('Coupon Code is required.');
    if (!form.discountValue) return setError('Discount Value is required.');
    setLoading(true);
    try {
      const res = await adminApi.call('/coupons', {
        method: 'POST',
        body: {
          code: form.code,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minOrderAmount: Number(form.minOrderAmount),
          maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
          validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          isActive: form.isActive,
        }
      });
      if (res.ok) {
        onSaved();
      }
    } catch (err) {
      if (err.data && err.data.error === 'COUPON_EXISTS') {
        setError('A coupon with this code already exists.');
      } else {
        setError(err.message || 'Failed to create coupon');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 my-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-navy">Create Coupon</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-lavender text-muted hover:text-navy grid place-items-center">
            <Icon name="close" size={16} />
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Coupon Code</label>
            <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy uppercase" placeholder="SUMMER20" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Type</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy">
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="AMOUNT">Fixed Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Value</label>
              <input type="number" min="1" max={form.discountType === 'PERCENTAGE' ? 100 : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy" placeholder="20" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Min Order (₹)</label>
              <input type="number" min="0" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy" placeholder="0" />
            </div>
            {form.discountType === 'PERCENTAGE' && (
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Max Cap (₹)</label>
                <input type="number" min="0" value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy" placeholder="No Limit" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Usage Limit</label>
              <input type="number" min="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy" placeholder="Unlimited" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wide">Expiry Date</label>
              <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-navy" />
            </div>
          </div>

          <label className="flex items-center gap-2 mt-4 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary" />
            <span className="text-sm font-bold text-navy">Coupon is active immediately</span>
          </label>

          <div className="pt-4 mt-2 border-t border-gray-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={loading} className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted hover:bg-lavender transition">Cancel</button>
            <button type="submit" disabled={loading} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition shadow-md disabled:opacity-70">
              {loading ? 'Saving...' : 'Create Coupon'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
