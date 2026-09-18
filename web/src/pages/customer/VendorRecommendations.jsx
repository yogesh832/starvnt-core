import { useState } from 'react';
import Icon from '../../components/Icon.jsx';

const VENDORS = [
  {
    id: 'vm-1',
    name: 'Premium Moments Photography',
    match: 94,
    recommended: true,
    rating: 4.8,
    reviews: 120,
    price: '₹48,000',
    image: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=600&q=80',
    bullets: [
      'Available on 26 November',
      'Covers Kisan Palace',
      '2 photographers',
      'Full-day coverage',
      'Travel included',
    ],
    whyCallout: 'Lowest validated total cost among vendors meeting your requirements.',
    features: {
      price: '₹48,000',
      availability: 'Available',
      travel: 'Included',
      photographers: '2',
      coverage: 'Full-day',
      experience: '4.8 ★',
      bestFor: 'Best value',
    },
  },
  {
    id: 'vm-2',
    name: 'Candid Stories',
    match: 87,
    recommended: false,
    rating: 4.6,
    reviews: 78,
    price: '₹52,000',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80',
    bullets: [
      'Available on 26 November',
      'Travel extra',
      '2 photographers',
      'Full-day coverage',
    ],
    features: {
      price: '₹52,000',
      availability: 'Available',
      travel: 'Extra',
      photographers: '2',
      coverage: 'Full-day',
      experience: '4.6 ★',
      bestFor: 'Higher experience',
    },
  },
  {
    id: 'vm-3',
    name: 'ShutterTalk',
    match: 78,
    recommended: false,
    rating: 4.4,
    reviews: 45,
    price: '₹45,000',
    image: 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=600&q=80',
    bullets: [
      'Limited availability',
      'Travel extra',
      '2 photographers',
      'Half-day coverage',
    ],
    features: {
      price: '₹45,000',
      availability: 'Limited',
      travel: 'Extra',
      photographers: '2',
      coverage: 'Half-day',
      experience: '4.4 ★',
      bestFor: 'Budget option',
    },
  },
];

/**
 * Compare Options Modal - side-by-side comparison matrix per Screen 6.
 */
export function CompareModal({ onClose, onSelectVendor }) {
  const rows = [
    { label: 'Price', key: 'price' },
    { label: 'Availability', key: 'availability' },
    { label: 'Travel', key: 'travel' },
    { label: 'Photographers', key: 'photographers' },
    { label: 'Coverage', key: 'coverage' },
    { label: 'Experience', key: 'experience' },
    { label: 'Best for', key: 'bestFor' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-6 sm:p-8 overflow-hidden animate-[pop_.18s_ease-out]">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-extrabold text-navy">Compare Options</h2>
            <p className="text-xs text-muted mt-0.5">Photography options matched to your date & venue</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold"
          >
            ✕
          </button>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="py-3 px-3 font-semibold text-muted w-1/4">Feature</th>
                {VENDORS.map((v) => (
                  <th key={v.id} className="py-3 px-3 text-center w-1/4">
                    <div className="font-bold text-navy truncate">{v.name}</div>
                    {v.recommended && (
                      <span className="inline-block mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                        Recommended
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-lavender/30 transition">
                  <td className="py-3 px-3 font-medium text-muted">{r.label}</td>
                  {VENDORS.map((v) => (
                    <td key={v.id} className="py-3 px-3 text-center font-semibold">
                      {v.features[r.key]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-4 px-3" />
                {VENDORS.map((v) => (
                  <td key={v.id} className="py-4 px-3 text-center">
                    <button
                      onClick={() => onSelectVendor(v)}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
                        v.recommended
                          ? 'bg-primary text-white hover:bg-primary-dark shadow-md shadow-primary/25'
                          : 'border border-primary/40 text-primary hover:bg-primary-soft'
                      }`}
                    >
                      Choose
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Why is Premium Moments better banner */}
        <div className="mt-5 p-4 rounded-2xl bg-primary-soft/60 border border-primary/20 flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-primary text-white grid place-items-center text-xs shrink-0 mt-0.5">
            ✨
          </div>
          <div>
            <div className="text-xs font-bold text-primary">Why is Premium Moments better?</div>
            <p className="text-xs text-ink/80 mt-0.5 leading-relaxed">
              Premium Moments offers the <b>lowest validated total cost</b> among vendors meeting your requirements,
              with excellent reviews and confirmed availability for Kisan Palace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Screen 5: Vendor Recommendations ("Photography Options")
 */
export default function VendorRecommendations({ onBack, onSelectVendor }) {
  const [showCompare, setShowCompare] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mb-1"
          >
            ← Back to Event
          </button>
          <h1 className="text-2xl font-extrabold text-navy">Vendor Recommendations</h1>
          <p className="text-xs text-muted">Photography Options · 3 pre-qualified vendors available</p>
        </div>
        <button
          onClick={() => setShowCompare(true)}
          className="rounded-xl border border-primary/40 text-primary bg-white hover:bg-primary-soft px-4 py-2 text-xs font-bold transition shadow-xs"
        >
          Compare All ▾
        </button>
      </div>

      {/* 3 Vendor Cards */}
      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {VENDORS.map((v) => (
          <div
            key={v.id}
            className={`bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col ${
              v.recommended ? 'border-2 border-primary ring-4 ring-primary/10' : 'border border-gray-100'
            }`}
          >
            {/* Image Header */}
            <div className="relative h-44 overflow-hidden bg-lavender">
              <img
                src={v.image}
                alt={v.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                {v.recommended && (
                  <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-xs">
                    ★ Recommended
                  </span>
                )}
                <span className="bg-white/90 backdrop-blur-xs text-navy text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                  {v.match}% Match
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-navy">{v.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-muted mt-0.5">
                      <span className="text-amber-500 font-bold">★ {v.rating}</span>
                      <span>({v.reviews} reviews)</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-navy">{v.price}</div>
                    <div className="text-[10px] text-muted">total cost</div>
                  </div>
                </div>

                {/* Bullets */}
                <ul className="mt-4 space-y-1.5 text-xs text-ink/80">
                  {v.bullets.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                {/* Why callout for recommended */}
                {v.whyCallout && (
                  <div className="mt-4 p-3 rounded-xl bg-lavender/70 border border-primary/20 text-xs">
                    <div className="font-bold text-primary text-[11px]">Why this option?</div>
                    <p className="text-[11px] text-muted mt-0.5">{v.whyCallout}</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowCompare(true)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 hover:bg-lavender text-ink/80 font-bold text-xs transition"
                >
                  {v.recommended ? 'View details' : 'Compare'}
                </button>
                <button
                  onClick={() => onSelectVendor(v)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition ${
                    v.recommended
                      ? 'bg-primary text-white hover:bg-primary-dark shadow-md shadow-primary/25'
                      : 'bg-lavender text-primary hover:bg-primary hover:text-white'
                  }`}
                >
                  {v.recommended ? 'Approve' : 'Choose'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCompare && (
        <CompareModal
          onClose={() => setShowCompare(false)}
          onSelectVendor={(vendor) => {
            setShowCompare(false);
            onSelectVendor(vendor);
          }}
        />
      )}
    </div>
  );
}
