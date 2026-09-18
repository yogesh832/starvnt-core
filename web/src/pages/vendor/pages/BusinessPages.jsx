import { useState, useEffect, useCallback } from 'react';
import { Page, Card, EmptyHint } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

/* ── Services ─────────────────────────────────────────────────────────────── */
export function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Photography');
  const [basePrice, setBasePrice] = useState(48000);
  const [leadTimeDays, setLeadTimeDays] = useState(7);

  const loadServices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalApi.call('/vendor/services');
      if (res.ok && res.services) {
        setServices(res.services);
      }
    } catch (err) {
      console.warn('[ServicesPage] Error loading services:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  async function handleAddService(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await externalApi.call('/vendor/services', {
        method: 'POST',
        body: {
          name,
          category,
          pricing: {
            basePrice: Number(basePrice),
            pricingType: 'FIXED',
            unit: 'event',
          },
          leadTimeDays: Number(leadTimeDays),
          status: 'ACTIVE',
        },
      });
      setShowAddModal(false);
      setName('');
      await loadServices();
    } catch (err) {
      alert(`Could not create service: ${err.message}`);
    }
  }

  return (
    <Page
      title="Services"
      sub="Capability, coverage, pricing and packages per service — this is what makes you matchable."
      action={
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-xs"
        >
          + Add Service
        </button>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        {services.map((s) => {
          const capText = s.capabilities?.length
            ? s.capabilities.map((c) => `${c.styles?.join(', ')} · ${c.format}`).join('; ')
            : 'Configured standard capability';
          const covText = s.coverage?.length
            ? s.coverage.map((c) => `${c.city || 'Kolkata'} (${c.radiusKm || 40} km)`).join(', ')
            : 'Barasat & Kolkata Metro';

          return (
            <Card key={s._id || s.name}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[15px] text-navy">{s.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    ₹{(s.pricing?.basePrice || 0).toLocaleString()} base
                  </div>
                </div>
                <StatusChip status={s.status || 'Active'} />
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="bg-lavender rounded-lg px-3 py-2">
                  <span className="text-muted font-semibold">Capability: </span>{capText}
                </div>
                <div className="bg-lavender rounded-lg px-3 py-2">
                  <span className="text-muted font-semibold">Coverage: </span>{covText}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <span className="text-xs font-semibold text-primary">Active in Matching</span>
                <span className="text-xs font-semibold text-muted">· {s.leadTimeDays || 7}d lead time</span>
              </div>
            </Card>
          );
        })}
        {services.length === 0 && !loading && (
          <div className="sm:col-span-2 text-center py-8 text-xs text-muted">
            No services configured. Click "+ Add Service" to define your offerings.
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">Add New Service</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddService} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wedding Photography & Video"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-semibold text-navy outline-none"
                >
                  <option value="Photography">Photography</option>
                  <option value="Videography">Videography</option>
                  <option value="Decor">Decor & Styling</option>
                  <option value="Catering">Catering</option>
                  <option value="Makeup">Makeup & Styling</option>
                  <option value="Music">DJ & Music</option>
                  <option value="Venue">Venue</option>
                  <option value="Planning">Event Planning</option>
                </select>
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Base Price (₹)</label>
                <input
                  type="number"
                  required
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Lead Time (Days)</label>
                <input
                  type="number"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark"
                >
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <EmptyHint text="A service becomes commercially ACTIVE only when capability, coverage, availability and pricing are complete (spec §3)." />
    </Page>
  );
}

/* ── Availability ─────────────────────────────────────────────────────────── */
export function AvailabilityPage() {
  const [blockouts, setBlockouts] = useState([]);
  const [resources, setResources] = useState([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const week = [
    ['Monday', true, '9 AM – 7 PM'],
    ['Tuesday', true, '9 AM – 7 PM'],
    ['Wednesday', true, '9 AM – 7 PM'],
    ['Thursday', true, '9 AM – 7 PM'],
    ['Friday', true, '9 AM – 9 PM'],
    ['Saturday', true, 'Full day'],
    ['Sunday', false, 'Off'],
  ];

  const loadAvailability = useCallback(async () => {
    try {
      const [blRes, resRes] = await Promise.all([
        externalApi.call('/vendor/availability/blockouts'),
        externalApi.call('/vendor/resources'),
      ]);
      if (blRes.ok && blRes.blockouts) setBlockouts(blRes.blockouts);
      if (resRes.ok && resRes.resources) setResources(resRes.resources);
    } catch (err) {
      console.warn('[AvailabilityPage] Error loading availability:', err.message);
    }
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  async function handleAddBlockout(e) {
    e.preventDefault();
    if (!blockDate) return;
    try {
      await externalApi.call('/vendor/availability/blockouts', {
        method: 'POST',
        body: { date: blockDate, reason: blockReason || 'Unavailable', allDay: true },
      });
      setShowBlockModal(false);
      setBlockDate('');
      setBlockReason('');
      await loadAvailability();
    } catch (err) {
      alert(`Could not block date: ${err.message}`);
    }
  }

  async function handleDeleteBlockout(id) {
    try {
      await externalApi.call(`/vendor/availability/blockouts/${id}`, { method: 'DELETE' });
      await loadAvailability();
    } catch (err) {
      alert(`Could not remove blockout: ${err.message}`);
    }
  }

  return (
    <Page title="Availability" sub="Availability = date + time + location + team + equipment (spec §5).">
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Weekly working hours">
          <ul className="divide-y divide-gray-50">
            {week.map(([d, on, hrs]) => (
              <li key={d} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-24 font-medium text-navy">{d}</span>
                <span className={`w-10 h-5 rounded-full relative transition ${on ? 'bg-primary' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${on ? 'left-5' : 'left-0.5'}`} />
                </span>
                <span className={`text-xs ${on ? 'text-ink' : 'text-muted'}`}>{hrs}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Blocked dates">
          <div className="flex flex-wrap gap-2">
            {blockouts.map((bl) => (
              <span
                key={bl._id}
                className="text-xs font-semibold bg-red-50 text-red-500 rounded-full px-3 py-1.5 flex items-center gap-1.5"
              >
                <span>{bl.date} · {bl.reason}</span>
                <button
                  onClick={() => handleDeleteBlockout(bl._id)}
                  className="hover:text-red-700 font-bold"
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              onClick={() => setShowBlockModal(true)}
              className="text-xs font-semibold border border-dashed border-gray-300 rounded-full px-3 py-1.5 text-muted hover:text-primary hover:border-primary/40"
            >
              + Block date
            </button>
          </div>
          <p className="text-xs text-muted mt-4">
            Blocked dates are excluded from eligibility before matching runs — customers never see unavailable slots.
          </p>
        </Card>
      </div>

      <Card title="Operational Resources & Team Capacity">
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          {(resources.length > 0
            ? resources
            : [
                { name: 'Team A (Lead & Cinematic)', identifier: '2 photographers · 6 cameras · Drone', type: 'STAFF' },
                { name: 'Team B (Associate)', identifier: '1 photographer · 2 cameras', type: 'STAFF' },
                { name: 'Post-Production Lab', identifier: '2 in-house editors · 48h highlight SLA', type: 'EQUIPMENT' },
              ]
          ).map((r) => (
            <div key={r._id || r.name} className="bg-lavender rounded-xl p-3">
              <div className="font-bold text-[13px] text-navy">{r.name}</div>
              <div className="text-muted mt-1">{r.identifier || r.notes || r.type}</div>
            </div>
          ))}
        </div>
      </Card>

      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">Block Calendar Date</h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddBlockout} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Leave, Vacation, Maintenance"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark"
                >
                  Confirm Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ── Documents ────────────────────────────────────────────────────────────── */
export function DocumentsPage() {
  const docs = [
    ['GST Certificate', 'GSTIN 19AAXXX…', 'Verified'],
    ['PAN Card', 'AXXPX…', 'Verified'],
    ['Vendor Agreement v2.1', 'Signed & Encrypted', 'Verified'],
    ['Bank Details', 'HDFC Bank · Primary Escrow', 'Verified'],
    ['Public Liability Insurance', 'Coverage ₹25,00,000', 'Verified'],
  ];
  return (
    <Page
      title="Documents"
      sub="KYC, agreements and banking — secure, controlled storage."
      action={<button className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-xs">+ Upload</button>}
    >
      <Card className="!p-0">
        <ul className="divide-y divide-gray-50">
          {docs.map(([name, meta, status]) => (
            <li key={name} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary grid place-items-center">
                <Icon name="documents" size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-navy">{name}</div>
                <div className="text-[11px] text-muted">{meta}</div>
              </div>
              <StatusChip status={status} />
            </li>
          ))}
        </ul>
      </Card>
      <EmptyHint text="Sensitive KYC/bank data uses controlled onboarding storage — verified by Core Platform." />
    </Page>
  );
}

/* ── Profile ──────────────────────────────────────────────────────────────── */
export function ProfilePage({ user, business = 'Premium Moments' }) {
  const [profile, setProfile] = useState({
    businessName: business,
    category: 'Photography',
    location: 'Barasat, Kolkata',
    phone: user?.phone || '+91 98300 12345',
    bio: 'Premier Kolkata wedding and event photography studio.',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await externalApi.call('/vendor/profile');
        if (res.ok && res.vendor) {
          setProfile({
            businessName: res.vendor.businessName || business,
            category: res.vendor.category || 'Photography',
            location: res.vendor.location || 'Barasat, Kolkata',
            phone: res.vendor.phone || user?.phone || '+91 98300 12345',
            bio: res.vendor.bio || '',
          });
        }
      } catch (err) {
        console.warn('[ProfilePage] Error loading profile:', err.message);
      }
    }
    loadProfile();
  }, [business, user]);

  async function handleSave(e) {
    e.preventDefault();
    try {
      await externalApi.call('/vendor/profile', {
        method: 'PUT',
        body: profile,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Could not save profile: ${err.message}`);
    }
  }

  const stages = ['Registered', 'Profile Details', 'Documents Verified', 'Services & Coverage', 'Active & Matchable'];
  const current = 4; // Active & Matchable

  return (
    <Page title="Business Profile" sub={`${profile.businessName} — Vendor • ${profile.category} · Your identity and activation state.`}>
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <Card title="Business details">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Business Name</label>
                <input
                  value={profile.businessName}
                  onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Primary Category</label>
                <input
                  value={profile.category}
                  onChange={(e) => setProfile({ ...profile, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Base Location</label>
                <input
                  value={profile.location}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Contact Phone</label>
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 shadow-xs transition"
              >
                Save changes
              </button>
              {saved && <span className="text-xs text-emerald-600 font-bold">✓ Profile updated successfully</span>}
            </div>
          </form>
        </Card>

        <Card title="Activation state">
          <ol className="relative mt-1 space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-gray-200">
            {stages.map((s, i) => (
              <li key={s} className="relative pl-7 text-sm">
                <span className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 ${
                  i < current ? 'bg-emerald-500 border-emerald-500' : i === current ? 'bg-primary border-primary' : 'bg-white border-gray-300'
                }`} />
                <span className={i <= current ? 'font-semibold text-navy' : 'text-muted'}>{s}</span>
                {i === current && <div className="text-[10px] text-primary font-bold">● Active in Customer Matching</div>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </Page>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────── */
export function SettingsPage() {
  const groups = [
    ['Notifications', [['New enquiry alerts', true], ['Quote status updates', true], ['Payment notifications', true], ['Weekly performance digest', false]]],
    ['Preferences', [['Auto-accept matching enquiries', false], ['Show travel cost estimates', true], ['Public portfolio visible', true]]],
  ];
  return (
    <Page title="Settings" sub="Account preferences for this vendor workspace.">
      <div className="space-y-4 max-w-2xl">
        {groups.map(([title, items]) => (
          <Card key={title} title={title}>
            <ul className="divide-y divide-gray-50">
              {items.map(([label, on]) => (
                <li key={label} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium text-navy">{label}</span>
                  <span className={`w-10 h-5 rounded-full relative cursor-pointer transition ${on ? 'bg-primary' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${on ? 'left-5' : 'left-0.5'}`} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Page>
  );
}
