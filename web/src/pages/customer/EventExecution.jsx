import { useState } from 'react';
import Icon from '../../components/Icon.jsx';

/**
 * Screen 8: Event Execution
 */
export default function EventExecution({ event, onBack }) {
  const [activeMilestone, setActiveMilestone] = useState(3);

  const milestones = [
    { label: 'Booked', date: '12 Oct, 2026', done: true },
    { label: 'Payment Verified', date: '13 Oct, 2026', done: true },
    { label: 'Service Scheduled', date: '15 Oct, 2026', done: true },
    { label: 'Service Starting', date: '26 Nov, 2026 · 11:00 AM', inProgress: true },
    { label: 'Service Completed', date: 'Pending completion evidence', done: false },
    { label: 'Verified & Settled', date: 'Core policy verification', done: false },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mb-1"
            >
              ← Back to Event Workspace
            </button>
          )}
          <h1 className="text-2xl font-extrabold text-navy">Event Execution</h1>
          <p className="text-xs text-muted">Your event is on track! Live operations & fulfillment timeline.</p>
        </div>
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-bold text-xs px-3.5 py-2 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Operations Feed Active</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
        {/* Left: Execution Lifecycle Stepper */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-extrabold text-navy mb-5">Fulfillment Lifecycle</h2>
          <ol className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
            {milestones.map((m, i) => {
              const isDone = m.done;
              const isCurrent = m.inProgress;
              return (
                <li key={m.label} className="relative pl-8">
                  <span
                    className={`absolute left-0 top-0.5 w-6 h-6 rounded-full border-2 grid place-items-center text-xs font-bold transition ${
                      isDone
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : isCurrent
                        ? 'bg-primary border-primary text-white ring-4 ring-primary/20 animate-pulse'
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}
                  >
                    {isDone ? (
                      <Icon name="check" size={12} strokeWidth={2.5} />
                    ) : isCurrent ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${isCurrent ? 'text-primary' : isDone ? 'text-navy' : 'text-muted'}`}>
                        {m.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold bg-primary-soft text-primary px-2 py-0.5 rounded-full">
                          In Progress
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted mt-0.5">{m.date}</div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 pt-5 border-t border-gray-100 flex gap-3">
            <button className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition">
              Is everything on track?
            </button>
            <button className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 transition">
              Report an issue
            </button>
          </div>
        </div>

        {/* Right: Operational Live Updates */}
        <div className="space-y-4">
          <h2 className="text-base font-extrabold text-navy">Live On-Site Status</h2>

          {/* Photographer Card */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex gap-4 items-center">
            <img
              src="https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=160&q=80"
              alt="Photographer"
              className="w-16 h-16 rounded-2xl object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-navy">Premium Moments Photography</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Confirmed
                </span>
              </div>
              <p className="text-xs text-ink/80 mt-1 leading-relaxed">
                Your photographer has confirmed availability and gear inspection. Everything is on track.
              </p>
              <div className="text-[10px] text-muted mt-1.5">Assigned Lead: Vikram Roy (Lead Candid)</div>
            </div>
          </div>

          {/* Decoration Card */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex gap-4 items-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Icon name="star" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-navy">Elegance Floral & Decor</span>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  10:00 AM Setup
                </span>
              </div>
              <p className="text-xs text-ink/80 mt-1 leading-relaxed">
                Your decoration team is scheduled for setup at 10:00 AM. Access instructions sent to venue manager.
              </p>
            </div>
          </div>

          {/* Catering Card */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex gap-4 items-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Icon name="services" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-navy">Royal Banquet Caterers</span>
                <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                  11:30 AM Arrival
                </span>
              </div>
              <p className="text-xs text-ink/80 mt-1 leading-relaxed">
                Your catering team will arrive by 11:30 AM with live chafing and welcome beverage counters.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
