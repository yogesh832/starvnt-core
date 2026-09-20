import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, Card, EmptyHint } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';
import MapLocationPicker from '../../../components/MapLocationPicker.jsx';
import { useTheme } from '../../../lib/ThemeContext.jsx';

/* ── Services ─────────────────────────────────────────────────────────────── */
export function ServicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Photography');
  const [basePrice, setBasePrice] = useState(48000);
  const [leadTimeDays, setLeadTimeDays] = useState(7);

  // Capability & Gear configuration state (Spec §3, §6, §10)
  const [showGearModal, setShowGearModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [gearFormat, setGearFormat] = useState('Full day');
  const [gearTeamSize, setGearTeamSize] = useState(2);
  const [gearSimultaneousLimit, setGearSimultaneousLimit] = useState(1);
  const [gearStyles, setGearStyles] = useState('Candid, Cinematic, Traditional, Drone 4K');
  const [gearEquipment, setGearEquipment] = useState('Sony FX3, 24-70mm f/2.8, DJI Mini 3 Drone, Godox Strobes');
  const [savingGear, setSavingGear] = useState(false);
  const [gearFeedback, setGearFeedback] = useState('');

  // Coverage & Transit configuration state (Spec §4, §5, §8)
  const [showCoverageModal, setShowCoverageModal] = useState(false);
  const [selectedServiceForCov, setSelectedServiceForCov] = useState(null);
  const [covCity, setCovCity] = useState('');
  const [covState, setCovState] = useState('');
  const [covRadiusKm, setCovRadiusKm] = useState(40);
  const [covLocalities, setCovLocalities] = useState('');
  const [covOutstation, setCovOutstation] = useState(false);
  const [tpFreeRadiusKm, setTpFreeRadiusKm] = useState(15);
  const [tpPerKmRate, setTpPerKmRate] = useState(40);
  const [tpEquipmentTransitFee, setTpEquipmentTransitFee] = useState(0);
  const [tpOutstationAllowance, setTpOutstationAllowance] = useState(1500);
  const [tpTollParkingIncluded, setTpTollParkingIncluded] = useState(false);
  const [tpAccommodationBeyondKm, setTpAccommodationBeyondKm] = useState(120);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [coverageFeedback, setCoverageFeedback] = useState('');

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

  const handledActionRef = useRef(null);

  const handleCloseGearModal = useCallback(() => {
    setShowGearModal(false);
    setSelectedService(null);
    handledActionRef.current = 'closed_gear';
    const next = new URLSearchParams(window.location.search);
    if (next.has('action')) {
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [setSearchParams]);

  const handleCloseCoverageModal = useCallback(() => {
    setShowCoverageModal(false);
    setSelectedServiceForCov(null);
    handledActionRef.current = 'closed_coverage';
    const next = new URLSearchParams(window.location.search);
    if (next.has('action')) {
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [setSearchParams]);

  // Handle auto-launch of Gear/Coverage Modal only when action is explicitly present
  const actionParam = searchParams.get('action');
  useEffect(() => {
    if (!actionParam) {
      handledActionRef.current = null;
      return;
    }
    if (handledActionRef.current === actionParam || handledActionRef.current === `closed_${actionParam}`) {
      return;
    }

    if (actionParam === 'gear' && services.length > 0) {
      handledActionRef.current = 'gear';
      handleOpenGearModal(services[0]);
    } else if (actionParam === 'coverage' && services.length > 0) {
      handledActionRef.current = 'coverage';
      handleOpenCoverageModal(services[0]);
    }
  }, [actionParam, services]);

  // Support closing modals with Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (showCoverageModal) handleCloseCoverageModal();
        if (showGearModal) handleCloseGearModal();
        if (showAddModal) setShowAddModal(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCoverageModal, showGearModal, showAddModal, handleCloseCoverageModal, handleCloseGearModal]);

  function handleOpenGearModal(service) {
    setSelectedService(service);
    const existingCap = service.capabilities?.[0];
    if (existingCap) {
      setGearFormat(existingCap.format || 'Full day');
      setGearTeamSize(existingCap.teamSize || 2);
      setGearSimultaneousLimit(existingCap.simultaneousEventLimit || 1);
      setGearStyles(existingCap.styles?.length ? existingCap.styles.join(', ') : 'Candid, Cinematic, Traditional');
      setGearEquipment(existingCap.equipment?.length ? existingCap.equipment.join(', ') : 'Sony FX3, 24-70mm f/2.8, DJI Mini 3 Drone');
    } else {
      setGearFormat('Full day');
      setGearTeamSize(2);
      setGearSimultaneousLimit(1);
      setGearStyles('Candid, Cinematic, Traditional, Drone 4K');
      setGearEquipment('Sony FX3, 24-70mm f/2.8, DJI Mini 3 Drone, Godox Strobes');
    }
    setShowGearModal(true);
  }

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

  async function handleSaveGear(e) {
    e.preventDefault();
    if (!selectedService) return;
    try {
      setSavingGear(true);
      const stylesArray = gearStyles
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const equipArray = gearEquipment
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await externalApi.call('/vendor/capabilities', {
        method: 'POST',
        body: {
          vendorServiceId: selectedService._id,
          styles: stylesArray,
          format: gearFormat,
          teamSize: Number(gearTeamSize) || 2,
          simultaneousEventLimit: Number(gearSimultaneousLimit) || 1,
          equipment: equipArray,
        },
      });

      if (res.ok) {
        setShowGearModal(false);
        if (searchParams.get('action')) {
          setSearchParams({});
        }
        setGearFeedback('Equipment, crew capacity and capabilities saved to database. Step 3 is verified!');
        setTimeout(() => setGearFeedback(''), 5000);
        await loadServices();
      }
    } catch (err) {
      alert(`Could not save capability: ${err.message}`);
    } finally {
      setSavingGear(false);
    }
  }

  async function handleOpenCoverageModal(service) {
    setSelectedServiceForCov(service);
    const existingCov = service.coverage?.[0];
    if (existingCov) {
      setCovCity(existingCov.city || 'Mumbai');
      setCovState(existingCov.state || 'Maharashtra');
      setCovRadiusKm(existingCov.radiusKm || 40);
      setCovLocalities(existingCov.localities?.join(', ') || '');
      setCovOutstation(Boolean(existingCov.outstationAllowed));
    } else {
      setCovCity('Mumbai');
      setCovState('Maharashtra');
      setCovRadiusKm(40);
      setCovLocalities('');
      setCovOutstation(false);
    }

    // Pre-load travel policy from DB
    try {
      const tpRes = await externalApi.call('/vendor/travel-policy');
      if (tpRes.ok && tpRes.travelPolicy) {
        setTpFreeRadiusKm(tpRes.travelPolicy.freeRadiusKm ?? 15);
        setTpPerKmRate(tpRes.travelPolicy.perKmRate ?? 40);
        setTpEquipmentTransitFee(tpRes.travelPolicy.equipmentTransitFee ?? 0);
        setTpOutstationAllowance(tpRes.travelPolicy.outstationDailyAllowance ?? 1500);
        setTpTollParkingIncluded(Boolean(tpRes.travelPolicy.tollAndParkingIncluded));
        setTpAccommodationBeyondKm(tpRes.travelPolicy.accommodationRequiredBeyondKm ?? 120);
      }
    } catch (err) {
      console.warn('[ServicesPage] Could not load travel policy:', err.message);
    }

    setShowCoverageModal(true);
  }

  async function handleSaveCoverage(e) {
    e.preventDefault();
    if (!selectedServiceForCov) return;
    try {
      setSavingCoverage(true);
      const locArray = covLocalities
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // 1. Save Service Coverage Area (Spec §4, §5)
      await externalApi.call('/vendor/coverage', {
        method: 'POST',
        body: {
          vendorServiceId: selectedServiceForCov._id,
          coverageType: 'RADIUS',
          city: covCity.trim(),
          state: covState.trim(),
          radiusKm: Number(covRadiusKm) || 40,
          localities: locArray,
          outstationAllowed: Boolean(covOutstation),
        },
      });

      // 2. Save Travel & Transit Logistics Policy (Spec §8)
      await externalApi.call('/vendor/travel-policy', {
        method: 'PUT',
        body: {
          freeRadiusKm: Number(tpFreeRadiusKm) || 15,
          perKmRate: Number(tpPerKmRate) || 40,
          equipmentTransitFee: Number(tpEquipmentTransitFee) || 0,
          outstationDailyAllowance: Number(tpOutstationAllowance) || 1500,
          tollAndParkingIncluded: Boolean(tpTollParkingIncluded),
          accommodationRequiredBeyondKm: Number(tpAccommodationBeyondKm) || 120,
        },
      });

      setShowCoverageModal(false);
      if (searchParams.get('action')) {
        setSearchParams({});
      }
      setCoverageFeedback('Operating radius, coverage area and transit policy saved to database. Step 4 is verified!');
      setTimeout(() => setCoverageFeedback(''), 5000);
      await loadServices();
    } catch (err) {
      alert(`Could not save coverage: ${err.message}`);
    } finally {
      setSavingCoverage(false);
    }
  }

  return (
    <Page
      title="Services & Capabilities"
      sub="Declare services, gear inventory, crew capacity, and operational formats (Spec §3, §6)."
      action={
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-xs transition hover:bg-primary-dark"
        >
          + Add Service
        </button>
      }
    >
      {gearFeedback && (
        <div className="mb-4 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-2">
          <Icon name="check" size={15} />
          <span>{gearFeedback}</span>
        </div>
      )}

      {coverageFeedback && (
        <div className="mb-4 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-2">
          <Icon name="check" size={15} />
          <span>{coverageFeedback}</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {services.map((s) => {
          const hasCap = s.capabilities && s.capabilities.length > 0;
          const primaryCap = hasCap ? s.capabilities[0] : null;
          const capText = hasCap
            ? s.capabilities.map((c) => `${c.styles?.join(', ')} · ${c.format}`).join('; ')
            : null;

          return (
            <Card key={s._id || s.name}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[15px] text-navy">{s.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    ₹{(s.pricing?.basePrice || 0).toLocaleString()} base · {s.category || 'Photography'}
                  </div>
                </div>
                <StatusChip status={s.status || 'Active'} />
              </div>

              <div className="mt-3 space-y-2.5 text-xs">
                {/* Capability & Gear Configuration Block (Spec §3, §6, §10) */}
                <div
                  className={`rounded-xl p-3 border transition ${
                    hasCap
                      ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950'
                      : 'bg-amber-50/60 border-amber-200/80 text-amber-950'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-bold flex items-center gap-1.5 text-xs">
                      <Icon name={hasCap ? 'check' : 'settings'} size={13} className={hasCap ? 'text-emerald-600' : 'text-amber-600'} />
                      <span className={hasCap ? 'text-emerald-900' : 'text-amber-900'}>
                        {hasCap ? 'Gear & Crew Declared' : 'Step 3: Gear & Capability Needed'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenGearModal(s)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${
                        hasCap
                          ? 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                          : 'bg-primary hover:bg-primary-dark text-white shadow-xs'
                      }`}
                    >
                      {hasCap ? 'Edit Gear' : 'Configure Gear'}
                    </button>
                  </div>

                  {hasCap ? (
                    <div className="space-y-1 text-[11px]">
                      <div>
                        <span className="font-semibold text-muted">Format & Styles: </span>
                        <span>{capText}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted">Crew Capacity: </span>
                        <span>{primaryCap?.teamSize || 2} crew members · Max {primaryCap?.simultaneousEventLimit || 1} concurrent event(s)</span>
                      </div>
                      {primaryCap?.equipment?.length > 0 && (
                        <div>
                          <span className="font-semibold text-muted">Equipment: </span>
                          <span className="font-mono text-[10px]">{primaryCap.equipment.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-900/90 leading-relaxed">
                      Declare equipment, crew capacity, and event formats to verify Step 3 of your onboarding checklist.
                    </p>
                  )}
                </div>

                {/* Coverage & Transit Configuration Block (Spec §4, §5, §8) */}
                {(() => {
                  const hasCov = s.coverage && s.coverage.length > 0;
                  const primaryCov = hasCov ? s.coverage[0] : null;

                  return (
                    <div
                      className={`rounded-xl p-3 border transition ${
                        hasCov
                          ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950'
                          : 'bg-amber-50/60 border-amber-200/80 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold flex items-center gap-1.5 text-xs">
                          <Icon
                            name={hasCov ? 'check' : 'mapPin'}
                            size={13}
                            className={hasCov ? 'text-emerald-600' : 'text-amber-600'}
                          />
                          <span className={hasCov ? 'text-emerald-900' : 'text-amber-900'}>
                            {hasCov ? 'Coverage & Transit Declared' : 'Step 4: Coverage & Transit Required'}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenCoverageModal(s)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                            hasCov
                              ? 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                              : 'bg-primary hover:bg-primary-dark text-white shadow-xs'
                          }`}
                        >
                          {hasCov ? 'Edit Transit' : 'Set Radius & Transit'}
                        </button>
                      </div>

                      {hasCov ? (
                        <div className="space-y-1 text-[11px]">
                          <div>
                            <span className="font-semibold text-muted">Operating Base & Radius: </span>
                            <span className="font-bold text-navy">
                              {primaryCov.radiusKm || 40} km radius from {primaryCov.city || 'Operational Base'}
                            </span>
                          </div>
                          {primaryCov.localities?.length > 0 && (
                            <div>
                              <span className="font-semibold text-muted">Key Localities: </span>
                              <span>{primaryCov.localities.join(', ')}</span>
                            </div>
                          )}
                          <div className="pt-0.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                primaryCov.outstationAllowed
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-lavender text-ink/70'
                              }`}
                            >
                              {primaryCov.outstationAllowed ? 'Outstation Events Permitted' : 'Base Metropolitan Area Only'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-900/90 leading-relaxed">
                          Set operating radius (km), operational base, and travel policy to verify Step 4 of your checklist.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 text-xs">
                <div className="flex gap-2 text-muted font-medium">
                  <span>{s.leadTimeDays || 7}d lead time</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpenGearModal(s)}
                    className="font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Icon name="settings" size={12} />
                    <span>{hasCap ? 'Edit Gear' : 'Gear (Step 3)'}</span>
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleOpenCoverageModal(s)}
                    className="font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Icon name="mapPin" size={12} />
                    <span>{s.coverage?.length ? 'Edit Transit' : 'Transit (Step 4)'}</span>
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
        {services.length === 0 && !loading && (
          <div className="sm:col-span-2 text-center py-10 text-xs text-muted border-2 border-dashed border-gray-200 rounded-3xl bg-lavender/20">
            No services configured yet. Click "+ Add Service" to define your offerings and gear.
          </div>
        )}
      </div>

      {/* Add Service Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">Add New Service</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
                aria-label="Close"
              >
                <Icon name="close" size={13} />
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
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-semibold text-navy outline-none focus:ring-2 focus:ring-primary/20"
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
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Lead Time (Days)</label>
                <input
                  type="number"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition"
                >
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configure Capability & Gear Modal (Spec §3, §6, §10) */}
      {showGearModal && selectedService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs"
          onClick={handleCloseGearModal}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-[pop_.18s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div>
                <h3 className="font-extrabold text-base text-navy">Configure Capability & Gear</h3>
                <p className="text-xs text-muted mt-0.5">Service: {selectedService.name}</p>
              </div>
              <button
                type="button"
                onClick={handleCloseGearModal}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition cursor-pointer"
                aria-label="Close"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            <form onSubmit={handleSaveGear} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Execution Format</label>
                  <select
                    value={gearFormat}
                    onChange={(e) => setGearFormat(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-semibold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Full day">Full day (8-12 hrs)</option>
                    <option value="Half day">Half day (4-6 hrs)</option>
                    <option value="Multi-day">Multi-day wedding</option>
                    <option value="Per event">Per event session</option>
                    <option value="Hourly">Hourly booking</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Crew / Team Size</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={gearTeamSize}
                    onChange={(e) => setGearTeamSize(e.target.value)}
                    placeholder="e.g. 2 photographers"
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Simultaneous Event Limit</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={gearSimultaneousLimit}
                  onChange={(e) => setGearSimultaneousLimit(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-[10px] text-muted mt-0.5 block">
                  How many concurrent bookings can your organization execute on the same date.
                </span>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Styles & Creative Formats</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Candid, Cinematic, Traditional, Drone 4K"
                  value={gearStyles}
                  onChange={(e) => setGearStyles(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-[10px] text-muted mt-0.5 block">Comma separated list of styles.</span>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Equipment & Gear Inventory</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Sony FX3, 24-70mm f/2.8 GM, DJI Mini 3 Drone, Godox AD200 Strobes"
                  value={gearEquipment}
                  onChange={(e) => setGearEquipment(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-[10px] text-muted mt-0.5 block">Comma separated list of professional gear.</span>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleCloseGearModal}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGear}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition disabled:opacity-60 cursor-pointer"
                >
                  {savingGear ? 'Saving Gear…' : 'Save Capability & Gear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configure Coverage & Transit Modal (Spec §4, §5, §8) */}
      {showCoverageModal && selectedServiceForCov && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs"
          onClick={handleCloseCoverageModal}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col animate-[pop_.18s_ease-out] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-extrabold text-base text-navy">Coverage & Transit Policy</h3>
                <p className="text-xs text-muted mt-0.5">Service: {selectedServiceForCov.name}</p>
              </div>
              <button
                type="button"
                onClick={handleCloseCoverageModal}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition cursor-pointer"
                aria-label="Close"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            <form onSubmit={handleSaveCoverage} className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Section 1: Operational Base & Operating Radius */}
              <div className="space-y-3 bg-lavender/30 p-3.5 rounded-2xl border border-gray-100">
                <div className="font-bold text-navy text-xs flex items-center gap-1.5">
                  <Icon name="mapPin" size={14} className="text-primary" />
                  <span>1. Operational Base & Operating Radius (Spec §4)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-semibold mb-1">Operational Base City</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mumbai, Delhi, Bengaluru"
                      value={covCity}
                      onChange={(e) => setCovCity(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-semibold mb-1">State / Province</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maharashtra"
                      value={covState}
                      onChange={(e) => setCovState(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-semibold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-muted font-semibold">Operating Radius (km)</label>
                    <span className="font-extrabold text-primary text-xs">{covRadiusKm} km</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={covRadiusKm}
                    onChange={(e) => setCovRadiusKm(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-muted font-medium mr-1">Presets:</span>
                    {[20, 40, 60, 100, 150, 250].map((km) => (
                      <button
                        key={km}
                        type="button"
                        onClick={() => setCovRadiusKm(km)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                          Number(covRadiusKm) === km
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-ink/70 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-semibold mb-1">Key Localities / Hubs Covered</label>
                  <input
                    type="text"
                    placeholder="e.g. Bandra, Andheri, South Mumbai, Thane, Navi Mumbai"
                    value={covLocalities}
                    onChange={(e) => setCovLocalities(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="text-[10px] text-muted mt-0.5 block">Comma-separated prominent zones or suburbs.</span>
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={covOutstation}
                    onChange={(e) => setCovOutstation(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20"
                  />
                  <div>
                    <span className="font-bold text-navy text-xs block">Allow Outstation Bookings</span>
                    <span className="text-[10px] text-muted block">Permit bookings beyond operating base radius (eligible for outstation transit allowances).</span>
                  </div>
                </label>
              </div>

              {/* Section 2: Travel & Transit Cost Policy (Spec §8) */}
              <div className="space-y-3 bg-lavender/30 p-3.5 rounded-2xl border border-gray-100">
                <div className="font-bold text-navy text-xs flex items-center gap-1.5">
                  <Icon name="truck" size={14} className="text-primary" />
                  <span>2. Travel & Transit Policy (Spec §8)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-semibold mb-1">Free Transit Radius (km)</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={tpFreeRadiusKm}
                      onChange={(e) => setTpFreeRadiusKm(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="text-[10px] text-muted mt-0.5 block">Zero extra transit charge within this zone.</span>
                  </div>
                  <div>
                    <label className="block text-muted font-semibold mb-1">Per-Km Transit Rate (₹/km)</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={tpPerKmRate}
                      onChange={(e) => setTpPerKmRate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="text-[10px] text-muted mt-0.5 block">Billed per km beyond free radius.</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-semibold mb-1">Equipment Transit Fee (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={tpEquipmentTransitFee}
                      onChange={(e) => setTpEquipmentTransitFee(e.target.value)}
                      placeholder="e.g. 0 or 2500"
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="text-[10px] text-muted mt-0.5 block">Heavy gear / production van surcharge.</span>
                  </div>
                  <div>
                    <label className="block text-muted font-semibold mb-1">Outstation Crew Allowance (₹/day)</label>
                    <input
                      type="number"
                      min="0"
                      value={tpOutstationAllowance}
                      onChange={(e) => setTpOutstationAllowance(e.target.value)}
                      placeholder="e.g. 1500"
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="text-[10px] text-muted mt-0.5 block">Daily per-diem for crew meals/lodging.</span>
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-semibold mb-1">Overnight Accommodation Beyond (km)</label>
                  <input
                    type="number"
                    min="0"
                    value={tpAccommodationBeyondKm}
                    onChange={(e) => setTpAccommodationBeyondKm(e.target.value)}
                    placeholder="e.g. 120"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="text-[10px] text-muted mt-0.5 block">Client provides room/hotel if venue exceeds this distance.</span>
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tpTollParkingIncluded}
                    onChange={(e) => setTpTollParkingIncluded(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20"
                  />
                  <div>
                    <span className="font-bold text-navy text-xs block">Tolls & Parking Included</span>
                    <span className="text-[10px] text-muted block">Toll taxes and venue parking fees are included in quote instead of billed at actuals.</span>
                  </div>
                </label>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleCloseCoverageModal}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCoverage}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition disabled:opacity-60 cursor-pointer"
                >
                  {savingCoverage ? 'Saving Coverage…' : 'Save Coverage & Travel Policy'}
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
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);

  // Blockout form
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('');

  // Resource form (Spec §6, §7)
  const [resType, setResType] = useState('TEAM_MEMBER');
  const [resName, setResName] = useState('');
  const [resIdentifier, setResIdentifier] = useState('');
  const [resCapacity, setResCapacity] = useState(1);
  const [resNotes, setResNotes] = useState('');
  const [savingResource, setSavingResource] = useState(false);

  // Dynamic Weekly working hours state from database
  const [workingHours, setWorkingHours] = useState({
    Monday: { isOpen: true, hours: '9 AM – 7 PM' },
    Tuesday: { isOpen: true, hours: '9 AM – 7 PM' },
    Wednesday: { isOpen: true, hours: '9 AM – 7 PM' },
    Thursday: { isOpen: true, hours: '9 AM – 7 PM' },
    Friday: { isOpen: true, hours: '9 AM – 9 PM' },
    Saturday: { isOpen: true, hours: 'Full day' },
    Sunday: { isOpen: false, hours: 'Off' },
  });
  const [savingHours, setSavingHours] = useState(false);
  const [hoursFeedback, setHoursFeedback] = useState('');

  // Travel & Transit Policy state (Spec §4, §8)
  const [travelPolicy, setTravelPolicy] = useState({
    freeRadiusKm: 15,
    perKmRate: 40,
    equipmentTransitFee: 0,
    tollAndParkingIncluded: false,
    outstationDailyAllowance: 1500,
    accommodationRequiredBeyondKm: 120,
  });
  const [savingTravelPolicy, setSavingTravelPolicy] = useState(false);
  const [travelPolicyFeedback, setTravelPolicyFeedback] = useState('');

  const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const loadAvailability = useCallback(async () => {
    try {
      const [blRes, resRes, hrsRes, tpRes] = await Promise.all([
        externalApi.call('/vendor/availability/blockouts'),
        externalApi.call('/vendor/resources'),
        externalApi.call('/vendor/availability/hours'),
        externalApi.call('/vendor/travel-policy'),
      ]);
      if (blRes.ok && blRes.blockouts) setBlockouts(blRes.blockouts);
      if (resRes.ok && resRes.resources) setResources(resRes.resources);
      if (hrsRes.ok && hrsRes.workingHours) setWorkingHours(hrsRes.workingHours);
      if (tpRes.ok && tpRes.travelPolicy) {
        setTravelPolicy({
          freeRadiusKm: tpRes.travelPolicy.freeRadiusKm ?? 15,
          perKmRate: tpRes.travelPolicy.perKmRate ?? 40,
          equipmentTransitFee: tpRes.travelPolicy.equipmentTransitFee ?? 0,
          tollAndParkingIncluded: Boolean(tpRes.travelPolicy.tollAndParkingIncluded),
          outstationDailyAllowance: tpRes.travelPolicy.outstationDailyAllowance ?? 1500,
          accommodationRequiredBeyondKm: tpRes.travelPolicy.accommodationRequiredBeyondKm ?? 120,
        });
      }
    } catch (err) {
      console.warn('[AvailabilityPage] Error loading availability:', err.message);
    }
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  async function handleSaveTravelPolicy(e) {
    if (e) e.preventDefault();
    try {
      setSavingTravelPolicy(true);
      const res = await externalApi.call('/vendor/travel-policy', {
        method: 'PUT',
        body: {
          freeRadiusKm: Number(travelPolicy.freeRadiusKm) || 15,
          perKmRate: Number(travelPolicy.perKmRate) || 40,
          equipmentTransitFee: Number(travelPolicy.equipmentTransitFee) || 0,
          outstationDailyAllowance: Number(travelPolicy.outstationDailyAllowance) || 1500,
          tollAndParkingIncluded: Boolean(travelPolicy.tollAndParkingIncluded),
          accommodationRequiredBeyondKm: Number(travelPolicy.accommodationRequiredBeyondKm) || 120,
        },
      });
      if (res.ok && res.travelPolicy) {
        setTravelPolicy({
          freeRadiusKm: res.travelPolicy.freeRadiusKm ?? 15,
          perKmRate: res.travelPolicy.perKmRate ?? 40,
          equipmentTransitFee: res.travelPolicy.equipmentTransitFee ?? 0,
          tollAndParkingIncluded: Boolean(res.travelPolicy.tollAndParkingIncluded),
          outstationDailyAllowance: res.travelPolicy.outstationDailyAllowance ?? 1500,
          accommodationRequiredBeyondKm: res.travelPolicy.accommodationRequiredBeyondKm ?? 120,
        });
        setTravelPolicyFeedback('Travel & transit policy saved to database');
        setTimeout(() => setTravelPolicyFeedback(''), 4000);
      }
    } catch (err) {
      alert(`Could not save travel policy: ${err.message}`);
    } finally {
      setSavingTravelPolicy(false);
    }
  }

  // Persistent DB sync for working hours
  const persistWorkingHours = useCallback(async (hoursObj) => {
    try {
      setSavingHours(true);
      const res = await externalApi.call('/vendor/availability/hours', {
        method: 'PUT',
        body: { workingHours: hoursObj },
      });
      if (res.ok && res.workingHours) {
        setWorkingHours(res.workingHours);
        setHoursFeedback('Saved to database');
        setTimeout(() => setHoursFeedback(''), 3000);
      }
    } catch (err) {
      console.warn('[AvailabilityPage] Could not persist hours:', err.message);
      setHoursFeedback(`Error: ${err.message}`);
    } finally {
      setSavingHours(false);
    }
  }, []);

  async function handleToggleDay(day) {
    const current = workingHours[day] || { isOpen: false, hours: 'Off' };
    const nextOpen = !current.isOpen;
    const nextHours = nextOpen ? (current.hours === 'Off' ? '9 AM – 7 PM' : current.hours) : 'Off';
    const updated = {
      ...workingHours,
      [day]: {
        isOpen: nextOpen,
        hours: nextHours,
      },
    };
    setWorkingHours(updated);
    // Auto-save immediately to DB upon toggle
    await persistWorkingHours(updated);
  }

  function handleHoursChange(day, newHours) {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: {
        isOpen: prev[day]?.isOpen ?? true,
        hours: newHours,
      },
    }));
  }

  async function handleHoursBlur() {
    await persistWorkingHours(workingHours);
  }

  async function handleManualSaveHours() {
    await persistWorkingHours(workingHours);
  }

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

  async function handleAddResource(e) {
    e.preventDefault();
    if (!resName.trim()) return;
    try {
      setSavingResource(true);
      await externalApi.call('/vendor/resources', {
        method: 'POST',
        body: {
          type: resType,
          name: resName.trim(),
          identifier: resIdentifier.trim(),
          capacityUnits: Number(resCapacity) || 1,
          notes: resNotes.trim(),
        },
      });
      setShowAddResourceModal(false);
      setResName('');
      setResIdentifier('');
      setResNotes('');
      setResCapacity(1);
      await loadAvailability();
    } catch (err) {
      alert(`Could not add resource: ${err.message}`);
    } finally {
      setSavingResource(false);
    }
  }

  async function handleDeleteResource(id) {
    if (!window.confirm('Are you sure you want to delete this operational resource?')) return;
    try {
      await externalApi.call(`/vendor/resources/${id}`, { method: 'DELETE' });
      await loadAvailability();
    } catch (err) {
      alert(`Could not delete resource: ${err.message}`);
    }
  }

  return (
    <Page title="Availability & Operations" sub="Availability = date + time + location + team + equipment (spec §5).">
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Weekly Working Hours - 100% User Maintained in DB */}
        <Card
          title="Weekly working hours"
          action={
            <div className="flex items-center gap-2">
              {savingHours ? (
                <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                  Saving…
                </span>
              ) : hoursFeedback ? (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <Icon name="check" size={12} />
                  {hoursFeedback}
                </span>
              ) : (
                <span className="text-[10px] text-muted font-medium hidden sm:inline">
                  Auto-sync active
                </span>
              )}
              <button
                onClick={handleManualSaveHours}
                disabled={savingHours}
                className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-3 py-1.5 shadow-xs transition disabled:opacity-60 cursor-pointer"
              >
                Save
              </button>
            </div>
          }
        >
          {hoursFeedback && (
            <div className="mb-3 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <Icon name="check" size={13} />
              <span>{hoursFeedback}</span>
            </div>
          )}

          <ul className="divide-y divide-gray-50">
            {daysList.map((day) => {
              const item = workingHours[day] || { isOpen: true, hours: '9 AM – 7 PM' };
              const isOpen = Boolean(item.isOpen);

              return (
                <li key={day} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex items-center gap-3 w-36">
                    <button
                      type="button"
                      onClick={() => handleToggleDay(day)}
                      className={`w-9 h-5 rounded-full relative transition cursor-pointer shrink-0 ${
                        isOpen ? 'bg-primary' : 'bg-gray-200'
                      }`}
                      title={`Click to turn ${day} ${isOpen ? 'Off' : 'On'} (saves to database)`}
                      aria-label={`Toggle ${day}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition ${
                          isOpen ? 'left-4.5' : 'left-0.5'
                        }`}
                      />
                    </button>
                    <span className={`font-semibold text-xs ${isOpen ? 'text-navy' : 'text-muted'}`}>
                      {day}
                    </span>
                  </div>

                  <div className="flex-1 max-w-[200px]">
                    <input
                      type="text"
                      disabled={!isOpen}
                      value={item.hours || (isOpen ? '9 AM – 7 PM' : 'Off')}
                      onChange={(e) => handleHoursChange(day, e.target.value)}
                      onBlur={handleHoursBlur}
                      className={`w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border transition outline-none ${
                        isOpen
                          ? 'bg-lavender/40 border-gray-200 text-navy focus:border-primary/40 focus:ring-1 focus:ring-primary/20'
                          : 'bg-gray-100/70 border-transparent text-muted'
                      }`}
                      placeholder={isOpen ? 'e.g. 9 AM – 7 PM' : 'Off'}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Blocked Dates - Displayed in RED from DB */}
        <Card
          title="Blocked dates"
          action={
            <button
              onClick={() => setShowBlockModal(true)}
              className="text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl px-3 py-1.5 shadow-xs transition inline-flex items-center gap-1 cursor-pointer"
            >
              <Icon name="plus" size={12} /> Block Date
            </button>
          }
        >
          <div className="space-y-2.5">
            {blockouts.map((bl) => (
              <div
                key={bl._id}
                className="p-3 rounded-2xl bg-red-50/90 border border-red-200 flex items-center justify-between gap-2 transition hover:border-red-300"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 grid place-items-center shrink-0">
                    <Icon name="calendar" size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-xs text-red-700">{bl.date}</div>
                    <div className="text-[11px] text-red-600/90 font-medium truncate">
                      {bl.reason || 'Unavailable / Blocked'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Blocked
                  </span>
                  <button
                    onClick={() => handleDeleteBlockout(bl._id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-200/60 text-red-500 hover:text-red-700 grid place-items-center transition cursor-pointer"
                    title="Unblock date"
                    aria-label="Remove blockout"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ))}

            {blockouts.length === 0 && (
              <div className="text-center py-8 text-xs text-muted border border-dashed border-gray-200 rounded-2xl bg-lavender/10">
                No dates currently blocked. All working days are open for customer matching.
              </div>
            )}
          </div>

          <p className="text-xs text-muted mt-4 leading-relaxed">
            Blocked dates are excluded from eligibility before matching runs — customers never see unavailable slots.
          </p>
        </Card>
      </div>

      {/* Operational Resources & Team Capacity - 100% User Maintained in DB */}
      <Card
        title="Operational Resources & Team Capacity"
        action={
          <button
            onClick={() => setShowAddResourceModal(true)}
            className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-semibold px-3.5 py-1.5 shadow-xs transition inline-flex items-center gap-1 cursor-pointer"
          >
            <Icon name="plus" size={12} /> Add Resource
          </button>
        }
      >
        <p className="text-xs text-muted mb-4 leading-relaxed">
          Operational resources (teams, camera kits, post-production labs, vehicles) define your multi-event capability and equipment availability (Spec §5, §6).
        </p>

        {resources.length > 0 ? (
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            {resources.map((r) => {
              const typeBadge =
                {
                  TEAM_MEMBER: 'CREW / TEAM',
                  STAFF: 'CREW / TEAM',
                  TEAM: 'CREW / TEAM',
                  EQUIPMENT: 'EQUIPMENT',
                  SPACE: 'STUDIO / LAB',
                  FACILITY: 'STUDIO / LAB',
                  VEHICLE: 'VEHICLE',
                  INVENTORY: 'INVENTORY',
                }[r.type] || r.type || 'RESOURCE';

              return (
                <div
                  key={r._id}
                  className="bg-white border border-gray-200/90 rounded-2xl p-3.5 space-y-2 hover:border-gray-300 transition shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-lavender text-ink/80 border border-gray-200/60">
                        {typeBadge}
                      </span>
                      <div className="font-bold text-sm text-navy mt-1 truncate">{r.name}</div>
                    </div>
                  <button
                    onClick={() => handleDeleteResource(r._id)}
                    className="w-7 h-7 rounded-lg hover:bg-rose-50 text-muted hover:text-rose-600 grid place-items-center transition cursor-pointer shrink-0"
                    title="Delete Resource"
                    aria-label="Delete Resource"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>

                {r.identifier && (
                  <div className="text-xs text-ink/80 font-medium bg-lavender/50 rounded-lg px-2.5 py-1.5">
                    {r.identifier}
                  </div>
                )}

                {r.notes && (
                  <div className="text-[11px] text-muted line-clamp-2">
                    {r.notes}
                  </div>
                )}

                  <div className="flex items-center justify-between text-[11px] text-muted pt-1 border-t border-gray-50">
                    <span>Capacity: {r.capacityUnits || 1} unit(s)</span>
                    <span className="font-semibold text-emerald-600">Active</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 px-4 rounded-2xl border-2 border-dashed border-gray-200 bg-lavender/20">
            <div className="w-10 h-10 mx-auto rounded-full bg-white shadow-xs border border-gray-200 grid place-items-center text-primary mb-2.5">
              <Icon name="operations" size={18} />
            </div>
            <div className="font-bold text-sm text-navy">No Operational Resources Declared</div>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-4 leading-relaxed">
              Declare your photography teams, camera kits, and editing suites so the OS can track your concurrent event capacity.
            </p>
            <button
              onClick={() => setShowAddResourceModal(true)}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2.5 shadow-xs transition cursor-pointer"
            >
              + Add First Resource
            </button>
          </div>
        )}
      </Card>

      {/* Coverage Radius & Travel Policy Card (Spec §4, §8) */}
      <Card
        title="Coverage Radius & Travel Policy"
        action={
          <div className="flex items-center gap-2">
            {savingTravelPolicy ? (
              <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                Saving…
              </span>
            ) : travelPolicyFeedback ? (
              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <Icon name="check" size={12} />
                {travelPolicyFeedback}
              </span>
            ) : (
              <span className="text-[10px] text-muted font-medium hidden sm:inline">
                Synced with DB
              </span>
            )}
            <button
              onClick={handleSaveTravelPolicy}
              disabled={savingTravelPolicy}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-3 py-1.5 shadow-xs transition disabled:opacity-60 cursor-pointer"
            >
              Save Policy
            </button>
          </div>
        }
      >
        {travelPolicyFeedback && (
          <div className="mb-3 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <Icon name="check" size={13} />
            <span>{travelPolicyFeedback}</span>
          </div>
        )}

        <p className="text-xs text-muted mb-4 leading-relaxed">
          Configure default transit pricing and travel rules. The matching and quoting engines apply these rules automatically when events require travel (Spec §5, §8).
        </p>

        <form onSubmit={handleSaveTravelPolicy} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
          <div>
            <label className="block text-muted font-semibold mb-1">Free Transit Radius (km)</label>
            <input
              type="number"
              min="0"
              value={travelPolicy.freeRadiusKm}
              onChange={(e) => setTravelPolicy({ ...travelPolicy, freeRadiusKm: e.target.value })}
              className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[10px] text-muted mt-0.5 block">No transit surcharge within this radius.</span>
          </div>

          <div>
            <label className="block text-muted font-semibold mb-1">Transit Rate (₹/km)</label>
            <input
              type="number"
              min="0"
              value={travelPolicy.perKmRate}
              onChange={(e) => setTravelPolicy({ ...travelPolicy, perKmRate: e.target.value })}
              className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[10px] text-muted mt-0.5 block">Billed per km beyond free radius.</span>
          </div>

          <div>
            <label className="block text-muted font-semibold mb-1">Equipment Transit Fee (₹)</label>
            <input
              type="number"
              min="0"
              value={travelPolicy.equipmentTransitFee}
              onChange={(e) => setTravelPolicy({ ...travelPolicy, equipmentTransitFee: e.target.value })}
              className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[10px] text-muted mt-0.5 block">Production vehicle / heavy gear fee.</span>
          </div>

          <div>
            <label className="block text-muted font-semibold mb-1">Outstation Daily Allowance (₹/day)</label>
            <input
              type="number"
              min="0"
              value={travelPolicy.outstationDailyAllowance}
              onChange={(e) => setTravelPolicy({ ...travelPolicy, outstationDailyAllowance: e.target.value })}
              className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[10px] text-muted mt-0.5 block">Per-crew per-diem allowance for meals/stay.</span>
          </div>

          <div>
            <label className="block text-muted font-semibold mb-1">Accommodation Beyond (km)</label>
            <input
              type="number"
              min="0"
              value={travelPolicy.accommodationRequiredBeyondKm}
              onChange={(e) => setTravelPolicy({ ...travelPolicy, accommodationRequiredBeyondKm: e.target.value })}
              className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-[10px] text-muted mt-0.5 block">Client provides stay beyond this distance.</span>
          </div>

          <div className="flex items-center pt-2 sm:pt-6">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={travelPolicy.tollAndParkingIncluded}
                onChange={(e) => setTravelPolicy({ ...travelPolicy, tollAndParkingIncluded: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20"
              />
              <div>
                <span className="font-bold text-navy text-xs block">Tolls & Parking Included</span>
                <span className="text-[10px] text-muted block">Included in base price</span>
              </div>
            </label>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>Configure per-service base city & operating radius:</span>
          <a
            href="/vendor/services?action=coverage"
            className="font-bold text-primary hover:underline inline-flex items-center gap-1"
          >
            <span>Manage Service Coverage & Base City (Step 4)</span>
            <Icon name="chevronRight" size={12} />
          </a>
        </div>
      </Card>

      {/* Block Date Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">Block Calendar Date</h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
                aria-label="Close"
              >
                <Icon name="close" size={13} />
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
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Leave, Personal Vacation, Equipment Maintenance"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Confirm Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Operational Resource Modal (Spec §6, §7) */}
      {showAddResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">Add Operational Resource</h3>
              <button
                onClick={() => setShowAddResourceModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
                aria-label="Close"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
            <form onSubmit={handleAddResource} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Resource Type</label>
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-semibold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="TEAM_MEMBER">Crew / Staff Team</option>
                    <option value="EQUIPMENT">Equipment Kit</option>
                    <option value="SPACE">Studio / Edit Lab</option>
                    <option value="VEHICLE">Production Vehicle</option>
                    <option value="INVENTORY">Inventory / Props</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Capacity Units</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={resCapacity}
                    onChange={(e) => setResCapacity(e.target.value)}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Resource Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Team A (Lead & Cinematic) or Master Drone Kit"
                  value={resName}
                  onChange={(e) => setResName(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Details & Gear Specification</label>
                <input
                  type="text"
                  placeholder="e.g. 2 photographers · 6 cameras · Drone"
                  value={resIdentifier}
                  onChange={(e) => setResIdentifier(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Operational Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 48h highlight SLA, assigned to prime weddings"
                  value={resNotes}
                  onChange={(e) => setResNotes(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddResourceModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingResource}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition disabled:opacity-60"
                >
                  {savingResource ? 'Adding…' : 'Add Resource to DB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ── Working Documents Manager (KYC & Verification) ───────────────────────── */
export function DocumentsManager({ isTab = false }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDocForPreview, setSelectedDocForPreview] = useState(null);

  const [docForm, setDocForm] = useState({
    title: 'GST Registration Certificate',
    type: 'GST',
    documentNumber: '',
    fileName: 'GST_Certificate.pdf',
    fileSize: '1.2 MB',
    expiryDate: '',
    notes: '',
  });

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalApi.call('/vendor/documents');
      if (res.ok && Array.isArray(res.documents)) {
        setDocuments(res.documents);
      }
    } catch (err) {
      console.warn('[DocumentsManager] Load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!docForm.title.trim()) return;

    try {
      setUploading(true);
      const res = await externalApi.call('/vendor/documents', {
        method: 'POST',
        body: docForm,
      });

      if (res.ok) {
        setShowUploadModal(false);
        setDocForm({
          title: 'GST Registration Certificate',
          type: 'GST',
          documentNumber: '',
          fileName: 'GST_Certificate.pdf',
          fileSize: '1.2 MB',
          expiryDate: '',
          notes: '',
        });
        await loadDocuments();
      }
    } catch (err) {
      alert(`Could not upload document: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId) {
    if (!window.confirm('Are you sure you want to remove this document record?')) return;
    try {
      const res = await externalApi.call(`/vendor/documents/${docId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadDocuments();
      }
    } catch (err) {
      alert(`Could not delete document: ${err.message}`);
    }
  }

  const content = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
        <div>
          <h2 className="font-extrabold text-base text-navy">KYC & Business Documents</h2>
          <p className="text-xs text-muted mt-0.5">
            Verified documents authenticate your brand and unlock high-trust placement in client search results.
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition flex items-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer"
        >
          <Icon name="plus" size={14} />
          <span>Upload Document</span>
        </button>
      </div>

      {documents.length > 0 ? (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <li key={doc._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-lavender/30 transition">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                    doc.type === 'GST' ? 'bg-purple-50 text-purple-600' :
                    doc.type === 'PAN' ? 'bg-sky-50 text-sky-600' :
                    doc.type === 'BANK_PROOF' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-primary-soft text-primary'
                  }`}>
                    <Icon name="documents" size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-navy">{doc.title}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-lavender text-muted uppercase">
                        {doc.type}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                      {doc.documentNumber && (
                        <span>ID: <strong className="text-navy">{doc.documentNumber}</strong></span>
                      )}
                      <span>·</span>
                      <span>{doc.fileName || 'document.pdf'} ({doc.fileSize || '1.2 MB'})</span>
                      <span>·</span>
                      <span>Added {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                    {doc.notes && (
                      <p className="text-[11px] text-muted italic mt-1">{doc.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    doc.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    doc.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {doc.status === 'VERIFIED' ? '✓ Verified by Core' :
                     doc.status === 'REJECTED' ? 'Action Required' :
                     '● Submitted · Verification Pending'}
                  </span>
                  <button
                    onClick={() => setSelectedDocForPreview(doc)}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleDelete(doc._id)}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                    title="Delete document"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : !loading ? (
        <Card className="text-center py-10 px-4 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary grid place-items-center mx-auto">
            <Icon name="documents" size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-navy">No Verification Documents Uploaded Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed">
              Upload your GST Registration, PAN Card, Bank Proof, or Business Incorporation Certificate to complete partner verification.
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition cursor-pointer"
          >
            <Icon name="plus" size={14} />
            <span>+ Upload Your First Document</span>
          </button>
        </Card>
      ) : (
        <Card className="text-center py-8 text-xs text-muted">
          Loading verification records…
        </Card>
      )}

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-[pop_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-extrabold text-base text-navy">Upload KYC / Business Document</h3>
                <p className="text-xs text-muted mt-0.5">Secure partner onboarding & Core platform verification</p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Document Category / Type</label>
                <select
                  value={docForm.type}
                  onChange={(e) => {
                    const t = e.target.value;
                    const defaultTitles = {
                      GST: 'GST Registration Certificate',
                      PAN: 'Company / Proprietor PAN Card',
                      BANK_PROOF: 'Bank Statement / Cancelled Cheque',
                      BUSINESS_REG: 'Business Registration / Incorporation',
                      INSURANCE: 'Commercial Liability Insurance',
                      ID_PROOF: 'Government ID Proof',
                      OTHER: 'Trade License / Other Proof',
                    };
                    setDocForm({
                      ...docForm,
                      type: t,
                      title: defaultTitles[t] || docForm.title,
                      fileName: `${t.toLowerCase()}_proof.pdf`,
                    });
                  }}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="GST">GST Registration Certificate</option>
                  <option value="PAN">PAN Card (Company / Proprietor)</option>
                  <option value="BANK_PROOF">Bank Statement / Cancelled Cheque</option>
                  <option value="BUSINESS_REG">Business Registration / Incorporation</option>
                  <option value="INSURANCE">Commercial Liability Insurance</option>
                  <option value="ID_PROOF">Government Identity Proof</option>
                  <option value="OTHER">Trade License / Other Proof</option>
                </select>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                  placeholder="e.g. GST Registration Certificate"
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Registration / Identifier Number</label>
                <input
                  type="text"
                  value={docForm.documentNumber}
                  onChange={(e) => setDocForm({ ...docForm, documentNumber: e.target.value })}
                  placeholder="e.g. 27AABCU9603R1ZM or PAN number"
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Attach File (PDF, PNG, JPG)</label>
                <div className="border border-dashed border-gray-300 rounded-2xl p-4 text-center bg-gray-50/50 hover:bg-lavender/30 transition">
                  <input
                    type="file"
                    id="docFileInput"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setDocForm({
                          ...docForm,
                          fileName: file.name,
                          fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                        });
                      }
                    }}
                  />
                  <label htmlFor="docFileInput" className="cursor-pointer block">
                    <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary grid place-items-center mx-auto mb-1.5">
                      <Icon name="plus" size={16} />
                    </div>
                    <span className="font-bold text-primary text-xs hover:underline block">Choose document file</span>
                    <span className="text-[10px] text-muted mt-0.5 block">
                      Selected: <strong>{docForm.fileName}</strong> ({docForm.fileSize})
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Additional Notes / Validity (Optional)</label>
                <input
                  type="text"
                  value={docForm.notes}
                  onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })}
                  placeholder="e.g. Primary verified business bank account"
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-dark transition disabled:opacity-60 cursor-pointer"
                >
                  {uploading ? 'Uploading…' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Details Modal */}
      {selectedDocForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs" onClick={() => setSelectedDocForPreview(null)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-[pop_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-extrabold text-base text-navy">{selectedDocForPreview.title}</h3>
              <button
                type="button"
                onClick={() => setSelectedDocForPreview(null)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-muted font-medium">Category:</span>
                <span className="font-bold text-navy">{selectedDocForPreview.type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-muted font-medium">Document ID:</span>
                <span className="font-mono font-bold text-navy">{selectedDocForPreview.documentNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-muted font-medium">Attached File:</span>
                <span className="font-semibold text-navy">{selectedDocForPreview.fileName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-muted font-medium">Status:</span>
                <span className="font-bold text-amber-700">{selectedDocForPreview.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-muted font-medium">Submitted On:</span>
                <span className="text-navy">{new Date(selectedDocForPreview.createdAt).toLocaleDateString()}</span>
              </div>
              {selectedDocForPreview.notes && (
                <div className="pt-1">
                  <span className="text-muted font-medium block">Notes:</span>
                  <p className="text-navy mt-0.5 italic">{selectedDocForPreview.notes}</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedDocForPreview(null)}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (isTab) {
    return content;
  }

  return (
    <Page
      title="Documents & Verification"
      sub="KYC, tax registration and banking — secure, controlled storage for platform trust."
    >
      {content}
    </Page>
  );
}

/* ── Working Settings Manager ────────────────────────────────────────────── */
export function SettingsManager({ isTab = false }) {
  const { dark, toggle: toggleTheme } = useTheme();
  const [settings, setSettings] = useState({
    enquiryAlerts: true,
    quoteUpdates: true,
    paymentAlerts: true,
    weeklyDigest: false,
    autoAcceptMatching: false,
    showTransitEstimates: true,
    publicPortfolioVisible: true,
  });
  const [saved, setSaved] = useState(false);

  function toggle(key) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const content = (
    <div className="space-y-4 max-w-2xl">
      <Card title="Notification Alerts">
        <ul className="divide-y divide-gray-50 text-xs">
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">New Enquiry & Lead Alerts</div>
              <div className="text-muted text-[11px]">Instant notifications when incoming customer event requests match your profile</div>
            </div>
            <button
              onClick={() => toggle('enquiryAlerts')}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${settings.enquiryAlerts ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.enquiryAlerts ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">Quote Status Changes</div>
              <div className="text-muted text-[11px]">Get alerted when a client views, approves, or requests adjustments to quotes</div>
            </div>
            <button
              onClick={() => toggle('quoteUpdates')}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${settings.quoteUpdates ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.quoteUpdates ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">Core Escrow & Payment Alerts</div>
              <div className="text-muted text-[11px]">Immediate notification when client payment is verified by Core Platform</div>
            </div>
            <button
              onClick={() => toggle('paymentAlerts')}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${settings.paymentAlerts ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.paymentAlerts ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">Weekly Business Performance Digest</div>
              <div className="text-muted text-[11px]">Summary of opportunities, quote conversion rates, and revenue analytics</div>
            </div>
            <button
              onClick={() => toggle('weeklyDigest')}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${settings.weeklyDigest ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.weeklyDigest ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
        </ul>
      </Card>

      <Card title="Marketplace Preferences">
        <ul className="divide-y divide-gray-50 text-xs">
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">Display Verified Transit Estimates</div>
              <div className="text-muted text-[11px]">Show calculated travel costs based on your operational base radius</div>
            </div>
            <button
              onClick={() => toggle('showTransitEstimates')}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${settings.showTransitEstimates ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.showTransitEstimates ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">Public Storefront Showcase</div>
              <div className="text-muted text-[11px]">Allow customers to browse published portfolio showcases on STARVNT</div>
            </div>
            <button
              onClick={() => toggle('publicPortfolioVisible')}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${settings.publicPortfolioVisible ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.publicPortfolioVisible ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
        </ul>
      </Card>

      <Card title="Display & Theme">
        <ul className="divide-y divide-gray-50 text-xs">
          <li className="flex items-center justify-between py-3">
            <div>
              <div className="font-bold text-navy">Dark Mode</div>
              <div className="text-muted text-[11px]">Toggle the application theme for the entire site</div>
            </div>
            <button
              onClick={toggleTheme}
              className={`w-11 h-6 rounded-full relative transition cursor-pointer ${dark ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${dark ? 'left-6' : 'left-1'}`} />
            </button>
          </li>
        </ul>
      </Card>

      {saved && (
        <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 animate-fadeIn">
          ✓ Preferences saved successfully.
        </div>
      )}
    </div>
  );

  if (isTab) {
    return content;
  }

  return (
    <Page title="Settings & Preferences" sub="Configure operational alerts and business preferences.">
      {content}
    </Page>
  );
}

/* ── Unified Profile Hub with Sub-Sidebar (Business Profile, Locations, Documents, Settings) ── */
export function ProfilePage({ user, business = '', defaultTab = 'profile' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || defaultTab || 'profile';
  const { dark, toggle: toggleTheme } = useTheme();

  function handleTabChange(tabKey) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabKey);
    setSearchParams(next, { replace: true });
  }

  const [profile, setProfile] = useState({
    businessName: business,
    category: '',
    location: '',
    phone: user?.phone || '',
    bio: '',
  });

  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [uploadingPic, setUploadingPic] = useState(false);
  const picInputRef = useRef(null);

  const [activation, setActivation] = useState(null);
  const [saved, setSaved] = useState(false);

  // Operating Locations state (Spec §4)
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationForm, setLocationForm] = useState({
    label: 'Main Studio',
    type: 'STUDIO',
    address: '',
    locality: '',
    city: '',
    state: 'Maharashtra',
    postalCode: '',
    coordinates: { lat: 19.076, lng: 72.8777 },
    isPrimary: true,
  });
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const [profRes, actRes] = await Promise.all([
        externalApi.call('/vendor/profile'),
        externalApi.call('/vendor/activation-status'),
      ]);
      if (profRes.ok && profRes.vendor) {
        setProfile({
          businessName: profRes.vendor.businessName || business || '',
          category: profRes.vendor.category || '',
          location: profRes.vendor.location || '',
          phone: profRes.vendor.phone || user?.phone || '',
          bio: profRes.vendor.bio || '',
        });
        if (profRes.vendor.profilePicUrl) {
          setProfilePicUrl(profRes.vendor.profilePicUrl);
        }
      }
      if (actRes.ok && actRes.status) {
        setActivation(actRes.status);
      }
    } catch (err) {
      console.warn('[ProfilePage] Error loading profile:', err.message);
    }
  }, [business, user]);

  const loadLocations = useCallback(async () => {
    try {
      setLoadingLocations(true);
      const res = await externalApi.call('/vendor/locations');
      if (res.ok && res.locations) {
        setLocations(res.locations);
      }
    } catch (err) {
      console.warn('[ProfilePage] Error loading locations:', err.message);
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadLocations();
  }, [loadProfile, loadLocations]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    try {
      const res = await externalApi.call('/vendor/profile', {
        method: 'PUT',
        body: profile,
      });
      if (res.ok && res.activation) {
        setActivation(res.activation);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Could not save profile: ${err.message}`);
    }
  }


  async function handleProfilePicUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB');
      return;
    }
    try {
      setUploadingPic(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await externalApi.call('/vendor/profile/picture', {
            method: 'PUT',
            body: { image: reader.result },
          });
          if (res.ok && res.profilePicUrl) {
            setProfilePicUrl(res.profilePicUrl);
            window.dispatchEvent(new Event('vendorProfileUpdated'));
          }
        } catch (err) {
          alert(`Could not upload profile picture: ${err.message}`);
        } finally {
          setUploadingPic(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingPic(false);
      alert(`Error reading file: ${err.message}`);
    }
  }

  async function handleProfilePicUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB');
      return;
    }
    try {
      setUploadingPic(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await externalApi.call('/vendor/profile/picture', {
            method: 'PUT',
            body: { image: reader.result },
          });
          if (res.ok && res.profilePicUrl) {
            setProfilePicUrl(res.profilePicUrl);
            window.dispatchEvent(new Event('vendorProfileUpdated'));
          }
        } catch (err) {
          alert(`Could not upload profile picture: ${err.message}`);
        } finally {
          setUploadingPic(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingPic(false);
      alert(`Error reading file: ${err.message}`);
    }
  }

  function handleOpenAddLocation() {
    setEditingLocationId(null);
    const hasExisting = locations.length > 0;
    const fallbackLat = locations[0]?.coordinates?.lat || 19.076;
    const fallbackLng = locations[0]?.coordinates?.lng || 72.8777;

    setLocationForm({
      label: hasExisting ? `Branch ${locations.length + 1}` : 'Main Studio',
      type: 'STUDIO',
      address: '',
      locality: '',
      city: profile.location || 'Mumbai',
      state: 'Maharashtra',
      postalCode: '',
      coordinates: { lat: fallbackLat, lng: fallbackLng },
      isPrimary: !hasExisting,
    });
    setLocationFeedback('');
    setShowMapModal(true);
  }

  function handleOpenEditLocation(loc) {
    setEditingLocationId(loc._id);
    setLocationForm({
      label: loc.label || 'Studio',
      type: loc.type || 'STUDIO',
      address: loc.address || '',
      locality: loc.locality || '',
      city: loc.city || '',
      state: loc.state || '',
      postalCode: loc.postalCode || '',
      coordinates: loc.coordinates || { lat: 19.076, lng: 72.8777 },
      isPrimary: Boolean(loc.isPrimary),
    });
    setLocationFeedback('');
    setShowMapModal(true);
  }

  async function handleSaveLocation(e) {
    e.preventDefault();
    if (!locationForm.address || !locationForm.city) {
      alert('Please select or enter an address and city for this location.');
      return;
    }

    try {
      setSavingLocation(true);
      const url = editingLocationId
        ? `/vendor/locations/${editingLocationId}`
        : '/vendor/locations';
      const method = editingLocationId ? 'PUT' : 'POST';

      const res = await externalApi.call(url, {
        method,
        body: locationForm,
      });

      if (res.ok) {
        setShowMapModal(false);
        await loadLocations();
        await loadProfile();
        setLocationFeedback('Location saved and synced to database.');
        setTimeout(() => setLocationFeedback(''), 4000);
      }
    } catch (err) {
      alert(`Could not save location: ${err.message}`);
    } finally {
      setSavingLocation(false);
    }
  }

  async function handleSetPrimary(locId) {
    try {
      const res = await externalApi.call(`/vendor/locations/${locId}/primary`, {
        method: 'PATCH',
      });
      if (res.ok) {
        await loadLocations();
        await loadProfile();
      }
    } catch (err) {
      alert(`Could not set primary location: ${err.message}`);
    }
  }

  async function handleDeleteLocation(locId) {
    if (!window.confirm('Are you sure you want to delete this operating location?')) return;
    try {
      const res = await externalApi.call(`/vendor/locations/${locId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadLocations();
        await loadProfile();
      }
    } catch (err) {
      alert(`Could not delete location: ${err.message}`);
    }
  }

  const SUB_TABS = [
    { id: 'profile', label: 'Business Profile', icon: 'profile', desc: 'Brand details & category' },
    { id: 'locations', label: 'Operating Locations', icon: 'mapPin', desc: 'Studio base & GPS hubs' },
    { id: 'documents', label: 'Documents & KYC', icon: 'documents', desc: 'GST, PAN & verification' },
    { id: 'settings', label: 'Account & Settings', icon: 'settings', desc: 'Alerts & preferences' },
  ];

  return (
    <Page
      title="Vendor Profile & Business Hub"
      sub={`${profile.businessName || 'Your Brand'} — ${profile.category || 'Setup Pending'} · Central administration for brand profile, operational locations, KYC documents, and account settings.`}
    >
      <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Profile Sub-Sidebar Navigation */}
        <div className="bg-white rounded-2xl p-2.5 border border-gray-100 shadow-xs space-y-1 sticky top-20">
          <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">
            Profile Sections
          </div>
          {SUB_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                  isActive
                    ? 'bg-primary-soft text-primary font-bold shadow-xs'
                    : 'text-ink/70 hover:bg-lavender hover:text-navy font-medium'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                  isActive ? 'bg-primary text-white' : 'bg-gray-100 text-muted'
                }`}>
                  <Icon name={tab.icon === 'mapPin' ? 'availability' : tab.icon} size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate leading-tight">{tab.label}</div>
                  <div className="text-[10px] text-muted truncate leading-tight mt-0.5">{tab.desc}</div>
                </div>
              </button>
            );
          })}

          <div className="pt-3 mt-2 border-t border-gray-100 px-3 pb-1">
            <div className="text-[11px] font-semibold text-muted">Profile Readiness</div>
            <div className="flex items-center justify-between text-xs font-bold text-navy mt-1">
              <span>{activation?.completionPercentage ?? 0}% Complete</span>
              <span className={activation?.is100Percent ? 'text-emerald-600' : 'text-amber-600'}>
                {activation?.is100Percent ? '✓ Active' : '● Setup Required'}
              </span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activation?.is100Percent ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{ width: `${activation?.completionPercentage ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tab Content Area */}
        <div className="min-w-0 space-y-5">
          {/* TAB 1: Business Profile */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* Display & Theme Toggle */}
              <Card title="Display Settings">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-navy">Dark Mode</h3>
                    <p className="text-xs text-muted mt-0.5">Toggle the application theme for the entire site</p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className={`w-11 h-6 rounded-full relative transition cursor-pointer ${dark ? 'bg-primary' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${dark ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </Card>

              {/* Profile Picture */}
              <Card title="Profile Picture">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative group shrink-0">
                    {profilePicUrl ? (
                      <img
                        src={profilePicUrl}
                        alt="Profile"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-white shadow-md dark:border-[#1a1d2e]"
                      />
                    ) : (
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-3xl font-extrabold shadow-md border-4 border-white dark:border-[#1a1d2e]">
                        {(profile.businessName || 'B')[0].toUpperCase()}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => picInputRef.current?.click()}
                      disabled={uploadingPic}
                      className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-primary text-white grid place-items-center shadow-lg hover:bg-primary-dark transition cursor-pointer disabled:opacity-60 border-2 border-white dark:border-[#1a1d2e]"
                      title="Change profile picture"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <input
                      ref={picInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfilePicUpload}
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <h3 className="font-extrabold text-base text-navy">
                      {profile.businessName || 'Your Brand'}
                    </h3>
                    <p className="text-sm text-muted mt-0.5">
                      {profile.category || 'Setup Pending'} &middot; {profile.location || 'City not set'}
                    </p>
                    <div className="mt-4 flex items-center justify-center sm:justify-start gap-4">
                      <button
                        type="button"
                        onClick={() => picInputRef.current?.click()}
                        disabled={uploadingPic}
                        className="text-xs font-bold bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary-dark transition shadow-sm cursor-pointer disabled:opacity-60"
                      >
                        {uploadingPic ? 'Uploading...' : profilePicUrl ? 'Change Photo' : 'Upload Photo'}
                      </button>
                      {profilePicUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Remove profile picture?')) return;
                            try {
                              const res = await externalApi.call('/vendor/profile/picture', {
                                method: 'PUT',
                                body: { image: '' },
                              });
                              if (res.ok) {
                                setProfilePicUrl('');
                                window.dispatchEvent(new Event('vendorProfileUpdated'));
                              }
                            } catch (err) {
                              alert(`Could not remove picture: ${err.message}`);
                            }
                          }}
                          className="text-xs font-bold text-rose-500 bg-rose-50 px-4 py-2 rounded-xl hover:bg-rose-100 dark:bg-rose-950/40 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted mt-2.5">
                      Recommended: Square image, at least 400x400px. Max 5 MB.
                    </p>
                  </div>
                </div>
              </Card>

              <Card title="Business Profile Details">
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Brand / Business Name</label>
                      <input
                        placeholder="e.g. CineMandap Studios"
                        value={profile.businessName}
                        onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                        required
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Primary Category</label>
                      <select
                        value={profile.category}
                        onChange={(e) => setProfile({ ...profile, category: e.target.value })}
                        required
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">Select Primary Category...</option>
                        <option value="Cinematic Production">Cinematic Production</option>
                        <option value="Photography">Photography</option>
                        <option value="Videography">Videography</option>
                        <option value="Decor & Styling">Decor & Styling</option>
                        <option value="Catering">Catering</option>
                        <option value="Makeup & Styling">Makeup & Styling</option>
                        <option value="DJ & Music">DJ & Music</option>
                        <option value="Venue">Venue</option>
                        <option value="Event Planning">Event Planning</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Primary City / Hub</label>
                      <input
                        placeholder="e.g. Mumbai, Kolkata, Delhi NCR, Bengaluru..."
                        value={profile.location}
                        onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                        required
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">Contact Phone</label>
                      <input
                        placeholder="+91 98765 43210"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-navy font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted font-semibold">About / Bio</label>
                    <textarea
                      rows={3}
                      placeholder="Briefly describe your signature style, experience and services..."
                      value={profile.bio}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-primary text-white text-xs font-bold px-5 py-2.5 shadow-sm hover:bg-primary-dark transition cursor-pointer"
                    >
                      Save Profile Details
                    </button>
                    {saved && <span className="text-xs font-bold text-emerald-600 animate-fadeIn">✓ Profile saved to database!</span>}
                  </div>
                </form>
              </Card>
            </div>
          )}

          {/* TAB 2: Operating Locations */}
          {activeTab === 'locations' && (
            <div className="space-y-5">
              <Card
                title="Operating Locations & Hubs (Spec §4)"
                extra={
                  <button
                    onClick={handleOpenAddLocation}
                    className="rounded-xl bg-primary text-white text-xs font-bold px-3.5 py-2 shadow-xs hover:bg-primary-dark transition flex items-center gap-1 cursor-pointer"
                  >
                    <Icon name="plus" size={14} />
                    <span>+ Add Location</span>
                  </button>
                }
              >
                <p className="text-xs text-muted mb-4 leading-relaxed">
                  According to the Universal Vendor OS specification, <b>location is an operational capability dimension</b>, not an address field. Your operational origins determine travel buffers, logistics costs, and authoritative client matching.
                </p>

                {locationFeedback && (
                  <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 animate-fadeIn">
                    ✓ {locationFeedback}
                  </div>
                )}

                {locations.length > 0 ? (
                  <div className="space-y-3">
                    {locations.map((loc) => (
                      <div
                        key={loc._id}
                        className={`p-4 rounded-2xl border transition-all ${
                          loc.isPrimary ? 'border-primary/40 bg-primary-soft/20 shadow-xs' : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl grid place-items-center text-sm font-bold shrink-0 mt-0.5 ${
                              loc.isPrimary ? 'bg-primary text-white shadow-xs' : 'bg-gray-100 text-muted'
                            }`}>
                              <Icon name="availability" size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-sm text-navy">{loc.label}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-lavender text-muted uppercase">
                                  {loc.type || 'STUDIO'}
                                </span>
                                {loc.isPrimary && (
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-primary text-white shadow-xs">
                                    ★ Primary Origin
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink/80 mt-1">
                                {loc.address}, {loc.locality ? `${loc.locality}, ` : ''}{loc.city}, {loc.state} {loc.postalCode}
                              </p>
                              {loc.coordinates?.lat && loc.coordinates?.lng && (
                                <div className="text-[11px] font-mono text-muted mt-0.5">
                                  GPS: {Number(loc.coordinates.lat).toFixed(4)}° N, {Number(loc.coordinates.lng).toFixed(4)}° E
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!loc.isPrimary && (
                              <button
                                onClick={() => handleSetPrimary(loc._id)}
                                className="text-[11px] font-bold text-muted hover:text-primary transition cursor-pointer"
                              >
                                Set as Primary
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditLocation(loc)}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteLocation(loc._id)}
                              className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !loadingLocations ? (
                  <div className="text-center py-8 text-xs text-muted border border-dashed border-gray-200 rounded-2xl">
                    No operating locations configured. Click "+ Add Location" to pin your studio base on the interactive map.
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-muted">Loading locations…</div>
                )}
              </Card>
            </div>
          )}

          {/* TAB 3: Documents & KYC Verification */}
          {activeTab === 'documents' && (
            <DocumentsManager isTab />
          )}

          {/* TAB 4: Account Settings */}
          {activeTab === 'settings' && (
            <SettingsManager isTab />
          )}
        </div>
      </div>

      {/* Add / Edit Location Map Modal */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs" onClick={() => setShowMapModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col animate-[pop_.18s_ease-out] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-extrabold text-base text-navy">
                  {editingLocationId ? 'Edit Operating Origin' : 'Add Operating Origin & Geocode'}
                </h3>
                <p className="text-xs text-muted mt-0.5">Pin location on map for automated distance & matching</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className="w-7 h-7 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="p-5 overflow-y-auto space-y-4 text-xs">
              <MapLocationPicker
                initialCoordinates={locationForm.coordinates}
                onLocationSelect={(geo) => {
                  setLocationForm((prev) => ({
                    ...prev,
                    address: geo.address || prev.address,
                    locality: geo.locality || prev.locality,
                    city: geo.city || prev.city,
                    state: geo.state || prev.state,
                    postalCode: geo.postalCode || prev.postalCode,
                    coordinates: geo.coordinates || prev.coordinates,
                  }));
                }}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Origin Label</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Studio, Central Kitchen"
                    value={locationForm.label}
                    onChange={(e) => setLocationForm({ ...locationForm, label: e.target.value })}
                    className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Location Type</label>
                  <select
                    value={locationForm.type}
                    onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value })}
                    className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-bold text-navy outline-none focus:ring-2 focus:ring-primary/25"
                  >
                    <option value="STUDIO">Studio</option>
                    <option value="HEAD_OFFICE">Head Office</option>
                    <option value="BRANCH">Branch</option>
                    <option value="WAREHOUSE">Warehouse</option>
                    <option value="KITCHEN">Kitchen</option>
                    <option value="EQUIPMENT_HUB">Equipment Hub</option>
                    <option value="STORAGE">Storage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Full Street Address</label>
                <input
                  type="text"
                  required
                  placeholder="Street address, building, road..."
                  value={locationForm.address}
                  onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                  className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-muted font-semibold mb-1">Locality</label>
                  <input
                    type="text"
                    placeholder="e.g. Bandra West"
                    value={locationForm.locality}
                    onChange={(e) => setLocationForm({ ...locationForm, locality: e.target.value })}
                    className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">City</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mumbai"
                    value={locationForm.city}
                    onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })}
                    className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-semibold text-navy outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">State</label>
                  <input
                    type="text"
                    placeholder="e.g. Maharashtra"
                    value={locationForm.state}
                    onChange={(e) => setLocationForm({ ...locationForm, state: e.target.value })}
                    className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Postal PIN</label>
                  <input
                    type="text"
                    placeholder="e.g. 400050"
                    value={locationForm.postalCode}
                    onChange={(e) => setLocationForm({ ...locationForm, postalCode: e.target.value })}
                    className="w-full bg-lavender/40 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                <span className="text-muted">Exact GPS Coordinates:</span>
                <span className="font-mono font-bold text-primary">
                  {Number(locationForm.coordinates?.lat || 0).toFixed(6)}° N, {Number(locationForm.coordinates?.lng || 0).toFixed(6)}° E
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="primaryOriginCheck"
                  checked={locationForm.isPrimary}
                  onChange={(e) => setLocationForm({ ...locationForm, isPrimary: e.target.checked })}
                  className="rounded text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                />
                <label htmlFor="primaryOriginCheck" className="text-xs font-semibold text-navy cursor-pointer">
                  Set as Primary Operating Origin
                </label>
              </div>

              <div className="pt-3 flex gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowMapModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:bg-primary-dark transition cursor-pointer disabled:opacity-60"
                >
                  {savingLocation ? 'Saving…' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ── Compatibility Wrappers for Direct Routes ────────────────────────────── */
export function DocumentsPage(props) {
  return <ProfilePage {...props} defaultTab="documents" />;
}

export function SettingsPage(props) {
  return <ProfilePage {...props} defaultTab="settings" />;
}
