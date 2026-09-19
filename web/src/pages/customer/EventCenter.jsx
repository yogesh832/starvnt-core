import { useState } from 'react';
import { StatusChip } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import VendorRecommendations from './VendorRecommendations.jsx';
import BookingPayment from './BookingPayment.jsx';
import EventExecution from './EventExecution.jsx';

export function Card({ title, action, className = '', children }) {
  return (
    <section className={`bg-white rounded-3xl shadow-sm p-5 sm:p-6 border border-gray-100 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-navy text-sm sm:text-base">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const REQ_STATUS = {
  Confirmed: 'bg-emerald-100 text-emerald-800',
  'Quotes Ready': 'bg-primary-soft text-primary',
  'In Progress': 'bg-amber-100 text-amber-800',
  'Action Needed': 'bg-rose-100 text-rose-800',
};

export function RequirementBadge({ status }) {
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
        REQ_STATUS[status] || 'bg-gray-100 text-gray-500'
      }`}
    >
      {status}
    </span>
  );
}
export const ReqChip = RequirementBadge;

const REQ_ICONS = {
  Venue: 'mapPin',
  Photography: 'camera',
  Decoration: 'star',
  Catering: 'services',
  Payment: 'wallet',
};

/**
 * Screen 4: Event Workspace (Command Center)
 */
export default function EventCenter({ event, onAskAura, onBackToEvents }) {
  // Stepper tabs: 'planning' | 'vendors' | 'booking' | 'payment' | 'execution'
  const [currentTab, setCurrentTab] = useState('planning');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [askInput, setAskInput] = useState('');
  const [askResponses, setAskResponses] = useState([]);

  const promptChips = [
    'Which photographer is best?',
    'Can I reduce the budget?',
    'What is still missing?',
    'Show me cheaper options',
  ];

  function handleAskChip(chip) {
    let answer = '';
    if (chip.includes('photographer')) {
      answer = 'Premium Moments Photography is ranked #1 (94% match) because it offers the lowest validated total cost with travel included for Kisan Palace.';
    } else if (chip.includes('budget')) {
      answer = 'You can save up to ₹18,000 by adjusting the photography coverage to 8 hours and choosing buffet-style catering.';
    } else if (chip.includes('missing')) {
      answer = 'You have confirmed the venue, but decoration and catering options are still pending your review.';
    } else {
      answer = 'We have 3 pre-vetted alternatives that fit your price range without compromising verified quality.';
    }
    setAskResponses((prev) => [...prev, { q: chip, a: answer }]);
  }

  function handleCustomAsk(e) {
    e.preventDefault();
    if (!askInput.trim()) return;
    const q = askInput.trim();
    setAskInput('');
    setAskResponses((prev) => [
      ...prev,
      {
        q,
        a: `Aura+ recommendation for "${q}": Based on your 500-guest count at Kisan Palace, we suggest reviewing the pre-matched options under the Vendors tab.`,
      },
    ]);
  }

  // If on "vendors" tab or vendor options active
  if (currentTab === 'vendors') {
    return (
      <VendorRecommendations
        onBack={() => setCurrentTab('planning')}
        onSelectVendor={(vendor) => {
          setSelectedVendor(vendor);
          setCurrentTab('payment');
        }}
      />
    );
  }

  // If on "payment" or "booking" tab
  if (currentTab === 'payment' || currentTab === 'booking') {
    return (
      <BookingPayment
        vendor={selectedVendor}
        event={event}
        onBack={() => setCurrentTab('vendors')}
        onPaymentSuccess={() => setCurrentTab('execution')}
      />
    );
  }

  // If on "execution" tab
  if (currentTab === 'execution') {
    return (
      <EventExecution
        event={event}
        onBack={() => setCurrentTab('planning')}
      />
    );
  }

  // Default: Planning tab (Screen 4)
  const pct = event.readiness || 68;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner with back button, details & venue picture */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=200&q=80"
            alt="Event thumbnail"
            className="w-16 h-16 rounded-2xl object-cover shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl text-navy">{event.name}</span>
              <span className="text-[10px] font-bold bg-primary-soft text-primary px-2.5 py-0.5 rounded-full">
                Planning
              </span>
            </div>
            <div className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon name="calendar" size={12} /> {event.date}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1"><Icon name="mapPin" size={12} /> {event.place}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1"><Icon name="customers" size={12} /> {event.guests} guests</span>
            </div>
          </div>
        </div>

        {/* Progress Gauge Ring */}
        <div className="flex items-center gap-3 bg-lavender/60 px-4 py-2.5 rounded-2xl border border-primary/20 shrink-0">
          <div className="relative w-12 h-12">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="3.5"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#5a4bd1"
                strokeWidth="3.5"
                strokeDasharray={`${pct}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-[10px] font-extrabold text-primary">
              {pct}%
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-navy">Readiness Score</div>
            <div className="text-[10px] text-muted">2 of 5 essentials confirmed</div>
          </div>
        </div>
      </div>

      {/* Stepper Navigation: Planning | Vendors | Booking | Payment | Execution */}
      <div className="bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 flex overflow-x-auto">
        {[
          { id: 'planning', label: '1. Planning' },
          { id: 'vendors', label: '2. Vendors' },
          { id: 'booking', label: '3. Booking' },
          { id: 'payment', label: '4. Payment' },
          { id: 'execution', label: '5. Execution' },
        ].map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-bold transition text-center ${
                isActive
                  ? 'bg-primary text-white shadow-sm shadow-primary/20'
                  : 'text-muted hover:text-navy hover:bg-lavender/50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Requirements Row (Cards) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-navy">Service Requirements</h2>
          <span className="text-xs text-primary font-bold cursor-pointer" onClick={() => setCurrentTab('vendors')}>
            View all options →
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          {/* Venue Card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-lavender text-navy flex items-center justify-center">
              <Icon name={REQ_ICONS.Venue} size={18} />
            </div>
            <div className="mt-3">
              <div className="text-xs font-extrabold text-navy">Venue</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                <Icon name="check" size={11} />
                <span>Confirmed</span>
              </div>
            </div>
          </div>

          {/* Photography Card (Clickable to open recommendations) */}
          <div
            onClick={() => setCurrentTab('vendors')}
            className="bg-white rounded-2xl p-4 border-2 border-primary ring-2 ring-primary/10 shadow-xs cursor-pointer hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-xs">
                <Icon name={REQ_ICONS.Photography} size={18} />
              </div>
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-extrabold text-navy">Photography</div>
              <div className="mt-1 text-[11px] font-bold text-primary flex items-center gap-1">
                <span>3 options ready</span>
                <span>→</span>
              </div>
            </div>
          </div>

          {/* Decoration Card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-lavender text-navy flex items-center justify-center">
              <Icon name={REQ_ICONS.Decoration} size={18} />
            </div>
            <div className="mt-3">
              <div className="text-xs font-extrabold text-navy">Decoration</div>
              <div className="mt-1 text-[11px] font-bold text-muted">4 options ready</div>
            </div>
          </div>

          {/* Catering Card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-lavender text-navy flex items-center justify-center">
              <Icon name={REQ_ICONS.Catering} size={18} />
            </div>
            <div className="mt-3">
              <div className="text-xs font-extrabold text-navy">Catering</div>
              <div className="mt-1 text-[11px] font-bold text-muted">5 options ready</div>
            </div>
          </div>

          {/* Payment Card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-lavender text-navy flex items-center justify-center">
              <Icon name={REQ_ICONS.Payment} size={18} />
            </div>
            <div className="mt-3">
              <div className="text-xs font-extrabold text-navy">Payment</div>
              <div className="mt-1 text-[11px] font-bold text-muted">₹0 paid</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ask STARVNT Anything Interactive Card */}
      <Card title="Ask STARVNT anything">
        <p className="text-xs text-muted mb-3">
          Get real-time answers about your event timeline, best-matching vendors, or cost optimizations.
        </p>

        {/* Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {promptChips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleAskChip(chip)}
              className="text-xs font-semibold bg-lavender hover:bg-primary-soft hover:text-primary text-ink/80 rounded-full px-3.5 py-1.5 transition border border-transparent hover:border-primary/20"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Q&A stream */}
        {askResponses.length > 0 && (
          <div className="space-y-3 mb-4 max-h-56 overflow-y-auto pr-1">
            {askResponses.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 text-xs space-y-1.5">
                <div className="font-bold text-navy flex items-center gap-1.5">
                  <span className="text-primary">Q:</span>
                  <span>{item.q}</span>
                </div>
                <div className="text-ink/80 leading-relaxed pl-4 flex items-start gap-1.5">
                  <Icon name="bolt" size={13} className="text-primary mt-0.5 shrink-0" />
                  <span>{item.a}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleCustomAsk} className="flex gap-2">
          <input
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder="Ask something about your event, venue or budget..."
            className="flex-1 bg-lavender/60 border border-gray-200 rounded-2xl px-4 py-2.5 text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            className="w-10 h-10 rounded-2xl bg-lavender text-muted hover:text-primary grid place-items-center transition"
            title="Voice input"
            aria-label="Voice input"
          >
            <Icon name="mic" size={16} />
          </button>
          <button
            type="submit"
            className="rounded-2xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-5 py-2.5 transition shadow-sm shadow-primary/20"
          >
            Ask
          </button>
        </form>
      </Card>

      {/* Next Actions & Recommendation Highlight */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-primary to-primary-dark text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 rounded-full px-2.5 py-0.5">
            Recommended Action
          </span>
          <h3 className="text-base font-bold mt-1.5">3 Verified Photography Quotes Ready for Review</h3>
          <p className="text-xs text-white/80 mt-0.5">
            Premium Moments Photography has the lowest validated total cost with confirmed slot availability.
          </p>
        </div>
        <button
          onClick={() => setCurrentTab('vendors')}
          className="rounded-xl bg-white text-primary hover:bg-gray-50 text-xs font-extrabold px-5 py-3 transition shadow-md whitespace-nowrap"
        >
          Review Quotes & Choose
        </button>
      </div>
    </div>
  );
}
