import { useState } from 'react';
import Icon from '../../components/Icon.jsx';

/**
 * Screen 7: Booking & Payment
 */
export default function BookingPayment({ vendor, event, onBack, onPaymentSuccess }) {
  const [method, setMethod] = useState('upi');
  const [isProcessing, setIsProcessing] = useState(false);

  const paymentMethods = [
    {
      id: 'upi',
      name: 'UPI (Recommended)',
      detail: 'Google Pay, PhonePe, Paytm, BHIM',
      badge: 'Instant & Zero Fee',
      icon: 'bolt',
    },
    {
      id: 'card',
      name: 'Credit / Debit Card',
      detail: 'Visa, Mastercard, RuPay, Maestro',
      badge: null,
      icon: 'payments',
    },
    {
      id: 'netbanking',
      name: 'Net Banking',
      detail: 'HDFC, ICICI, SBI, Axis & all major banks',
      badge: null,
      icon: 'wallet',
    },
    {
      id: 'wallet',
      name: 'Wallet',
      detail: 'Paytm, Amazon Pay, Mobikwik',
      badge: null,
      icon: 'wallet',
    },
  ];

  function handlePay() {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onPaymentSuccess();
    }, 1200);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mb-1"
        >
          ← Back to Recommendations
        </button>
        <h1 className="text-2xl font-extrabold text-navy">Booking & Payment</h1>
        <p className="text-xs text-muted">You're almost done. Secure your booking with verified escrow protection.</p>
      </div>

      <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-start">
        {/* Left: Summary Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <img
              src={vendor?.image || 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=200&q=80'}
              alt={vendor?.name}
              className="w-16 h-16 rounded-2xl object-cover"
            />
            <div>
              <span className="text-[10px] font-bold tracking-wider text-primary uppercase bg-primary-soft rounded-full px-2 py-0.5">
                Photography
              </span>
              <h3 className="font-bold text-base text-navy mt-1">{vendor?.name || 'Premium Moments Photography'}</h3>
              <div className="text-xs text-muted">2 Photographers · Full day coverage</div>
            </div>
          </div>

          {/* Booking Details */}
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-gray-50">
              <span className="text-muted">Event Date</span>
              <span className="font-semibold text-navy">{event?.date || '26 November 2026'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-50">
              <span className="text-muted">Service Location</span>
              <span className="font-semibold text-navy">{event?.place || 'Kisan Palace, New Town'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-50">
              <span className="text-muted">Guest Count</span>
              <span className="font-semibold text-navy">{event?.guests || 500} guests</span>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="p-4 rounded-2xl bg-lavender/60 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Base Photography Price</span>
              <span className="font-semibold">₹46,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Verified Travel & Logistics</span>
              <span className="font-semibold">₹2,000</span>
            </div>
            <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline">
              <span className="font-extrabold text-sm text-navy">Validated Total</span>
              <span className="font-extrabold text-lg text-primary">{vendor?.price || '₹48,000'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-[11px] text-emerald-700 bg-emerald-50 rounded-xl p-3">
            <Icon name="shieldCheck" size={16} className="text-emerald-600 shrink-0" />
            <span>Covered by STARVNT 100% Money-Back & Fulfillment Guarantee</span>
          </div>
        </div>

        {/* Right: Payment Method Selector */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-navy">Select Payment Method</h2>
            <p className="text-xs text-muted mt-0.5">Funds are held in Escrow and released only after verified execution</p>
          </div>

          <div className="space-y-3">
            {paymentMethods.map((pm) => (
              <label
                key={pm.id}
                onClick={() => setMethod(pm.id)}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border cursor-pointer transition ${
                  method === pm.id
                    ? 'border-primary bg-primary-soft/40 shadow-xs'
                    : 'border-gray-100 hover:border-gray-200 hover:bg-lavender/30'
                }`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  checked={method === pm.id}
                  onChange={() => setMethod(pm.id)}
                  className="w-4 h-4 text-primary accent-primary"
                />
                <span className="w-8 h-8 rounded-xl bg-lavender flex items-center justify-center text-primary shrink-0">
                  <Icon name={pm.icon} size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-navy">{pm.name}</span>
                    {pm.badge && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                        {pm.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted truncate">{pm.detail}</div>
                </div>
              </label>
            ))}
          </div>

          {method === 'upi' && (
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
              <label className="block text-xs font-semibold text-navy">Enter UPI ID / VPA</label>
              <div className="flex gap-2">
                <input
                  placeholder="e.g. mobile@upi or user@okhdfcbank"
                  defaultValue="sharma.family@okhdfcbank"
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-primary"
                />
                <button className="bg-lavender text-primary font-bold text-xs px-4 rounded-xl hover:bg-primary-soft">
                  Verify
                </button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handlePay}
              disabled={isProcessing}
              className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-dark text-white font-extrabold text-sm transition shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Verifying with Payment Core...</span>
                </>
              ) : (
                <>
                  <span>Confirm & Pay {vendor?.price || '₹48,000'}</span>
                  <Icon name="lock" size={14} className="inline ml-1" />
                </>
              )}
            </button>
            <div className="flex items-center justify-center gap-4 text-[11px] text-muted mt-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon name="shieldCheck" size={13} className="text-emerald-600" /> 256-Bit SSL Encryption</span>
              <span>•</span>
              <span>100% Secure Payments</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
