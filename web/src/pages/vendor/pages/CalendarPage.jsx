import ServiceResources from '../../../components/ServiceResources.jsx';
import NotificationPreferences from '../../../components/NotificationPreferences.jsx';
import CommitmentForm from '../../../components/CommitmentForm.jsx';
import { useState, useEffect, useCallback } from 'react';
import { Page, Card} from './shared.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return { year: y, month: m, day: d };
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
  const [bookings, setBookings] = useState([]);
  const [blockouts, setBlockouts] = useState([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [services, setServices] = useState([]);
  const [resources, setResources] = useState([]);
  const [loadError, setLoadError] = useState('');

  const loadCalendarData = useCallback(async () => {
    try {
      const [bkRes, blRes, serviceRes, resourceRes, legacyRes] = await Promise.all([
        externalApi.call('/vendor/bookings'),
        externalApi.call('/vendor/availability/blockouts'),
        externalApi.call('/vendor/services'),
        externalApi.call('/vendor/resources'),
        externalApi.call('/vendor/availability/bookings'),
      ]);

      setServices(serviceRes.services || []);
      setResources(resourceRes.resources || []);
      setLoadError('');
      if (bkRes.ok && bkRes.bookings) {
        setBookings(bkRes.bookings);
      }
      if (blRes.ok && blRes.blockouts) {
        setBlockouts([...blRes.blockouts, ...(legacyRes.bookings || []).filter(row => !['CANCELLED', 'COMPLETED'].includes(row.status)).map(row => ({ ...row, sourceModel: 'VendorBookingSlot', recordType: 'EXTERNAL_COMMITMENT', verificationStatus: 'REPORTED', allDay: false, reason: 'Legacy vendor-reported commitment', scope: row.assignedResources?.length ? 'RESOURCE' : 'SERVICE' }))]);
      }
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    loadCalendarData();
    const timer = setInterval(loadCalendarData, 30000);
    window.addEventListener('focus', loadCalendarData);
    return () => { clearInterval(timer); window.removeEventListener('focus', loadCalendarData); };
  }, [loadCalendarData]);

  async function handleDeleteBlockout(id) {
    if (!confirm('Cancel this availability record? Existing STARVNT bookings remain unchanged.')) return;
    try {
      const record = blockouts.find(row => row._id === id);
      await externalApi.call(`/vendor/availability/${record?.sourceModel === 'VendorBookingSlot' ? 'bookings' : 'blockouts'}/${id}`, { method: 'DELETE' });
      await loadCalendarData();
    } catch (err) {
      alert(`Could not remove blockout: ${err.message}`);
    }
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthTitle = `${monthNames[month]} ${year}`;

  // Map events by day number
  const eventsByDay = {};
  bookings.forEach((b) => {
    const parsed = parseLocalDate(b.eventDate || b.date);
    if (parsed && parsed.year === year && parsed.month === month) {
      const dayNum = parsed.day;
      eventsByDay[dayNum] = eventsByDay[dayNum] || [];
      eventsByDay[dayNum].push({
        id: b._id || b.bookingReference,
        title: `${b.serviceName} (${b.customerName || 'Client'})`,
        time: 'Full Day Event',
        place: b.serviceLocation?.locality ? `${b.serviceLocation.locality}, ${b.serviceLocation.city}` : 'Client Venue',
        amount: `₹${(b.totalAmount || 0).toLocaleString()}`,
        status: b.bookingStatus,
        type: 'BOOKING',
      });
    }
  });

  // Map blockouts by day number
  blockouts.forEach((bl) => {
    days.forEach(d => {
      const day = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (day < bl.date || day > (bl.endDate || bl.date) || (!bl.allDay && day === bl.endDate && bl.endTime === '00:00')) return;
      eventsByDay[d] = eventsByDay[d] || [];
      eventsByDay[d].push({ id: bl._id, date: bl.date, reason: bl.reason, title: `${bl.recordType === 'EXTERNAL_COMMITMENT' ? 'External commitment' : 'Blocked'}: ${bl.reason}`, time: bl.allDay ? 'All day' : `${bl.startTime} – ${bl.endTime}`, place: `${bl.scope || 'BUSINESS'} · ${bl.timezone || 'Asia/Kolkata'} · Reported`, type: 'BLOCKOUT' });
    });
  });

  const selectedEvents = eventsByDay[selectedDay] || [];

  return (
    <Page
      title="Calendar"
      sub="Operational feasibility view — calendar + travel + team + equipment together."
      action={
        <button
          onClick={() => { setEditing(null); setShowBlockModal(true); }}
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-xs inline-flex items-center gap-1.5 hover:bg-primary-dark transition"
        >
          <Icon name="plus" size={14} /> Block Date
        </button>
      }
    >
      {loadError && <p role="alert" className="text-red-700 mb-3">Could not refresh calendar: {loadError}</p>}
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-navy text-base">{monthTitle}</h2>
            <div className="flex items-center gap-1 text-muted">
              <button
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-lavender grid place-items-center transition text-navy"
                aria-label="Previous month"
                title="Previous month"
              >
                <Icon name="chevronLeft" size={14} />
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  setCurrentDate(now);
                  setSelectedDay(now.getDate());
                }}
                className="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-lavender text-navy transition"
                title="Today"
              >
                Today
              </button>
              <button
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-lavender grid place-items-center transition text-navy"
                aria-label="Next month"
                title="Next month"
              >
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-muted font-bold py-2 text-[11px] uppercase tracking-wider">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
            {days.map((d) => {
              const dayEvents = eventsByDay[d];
              const hasBooking = dayEvents?.some((e) => e.type === 'BOOKING');
              const hasBlockout = dayEvents?.some((e) => e.type === 'BLOCKOUT');
              const isSelected = selectedDay === d;

              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`py-2 px-1 rounded-2xl text-xs sm:text-sm font-medium transition relative flex flex-col items-center justify-center min-h-[50px] ${
                    isSelected && hasBlockout
                      ? 'bg-red-600 text-white font-black ring-4 ring-red-200 shadow-md'
                      : isSelected
                      ? 'bg-primary text-white font-black shadow-md'
                      : hasBlockout
                      ? 'bg-red-50 text-red-700 font-extrabold border-2 border-red-300 ring-1 ring-red-200 hover:bg-red-100 shadow-2xs'
                      : hasBooking
                      ? 'bg-primary-soft text-primary font-bold hover:bg-primary-soft/80'
                      : 'hover:bg-lavender text-ink/80'
                  }`}
                >
                  <span>{d}</span>
                  {hasBlockout && (
                    <span className={`text-[8px] font-black uppercase tracking-tight mt-0.5 px-1 rounded ${
                      isSelected ? 'bg-red-800 text-white' : 'bg-red-200 text-red-800'
                    }`}>
                      Blocked
                    </span>
                  )}
                  {hasBooking && !hasBlockout && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-muted flex-wrap gap-2 font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span>Confirmed Booking</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
              <span className="font-bold text-red-700">Blocked Date (Red)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
              <span>Commercially Free</span>
            </div>
          </div>
        </Card>

        {/* Selected Day Event Drawer */}
        <div className="space-y-4">
          <Card title={`Events — ${selectedDay} ${monthNames[month]} ${year}`}>
            {selectedEvents.length === 0 && (
              <div className="text-sm text-muted py-4 text-center">No events scheduled for this date.</div>
            )}
            <ul className="space-y-3">
              {selectedEvents.map((e) => (
                <li
                  key={e.id}
                  className={`border-2 rounded-2xl p-4 text-xs transition ${
                    e.type === 'BLOCKOUT'
                      ? 'border-red-200 bg-red-50/80 shadow-xs'
                      : 'border-gray-100 bg-white shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.type === 'BLOCKOUT' ? 'bg-red-600' : 'bg-primary'}`} />
                      <span className={`font-extrabold text-sm ${e.type === 'BLOCKOUT' ? 'text-red-900' : 'text-navy'}`}>
                        {e.title}
                      </span>
                    </div>
                    {e.type === 'BLOCKOUT' && (
                      <button
                        onClick={() => handleDeleteBlockout(e.id)}
                        className="text-[11px] text-red-700 font-extrabold hover:text-red-900 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition shrink-0"
                      >
                        Unblock
                      </button>
                    )}
                  </div>
                  <div className={`mt-1.5 font-medium flex items-center gap-2 ${e.type === 'BLOCKOUT' ? 'text-red-800' : 'text-muted'}`}>
                    <span>{e.time}</span>
                    <span>·</span>
                    <span>{e.place}</span>
                  </div>
                  {e.type === 'BLOCKOUT' && (
                    <div className="text-[10px] text-red-600 font-semibold mt-1.5">
                      The affected interval and scope are checked by customer matching.
                    </div>
                  )}
                  {e.amount && <div className="text-primary font-bold text-sm mt-1.5">{e.amount}</div>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Feasibility & Transit Policy">
            <ul className="space-y-2.5 text-xs text-muted">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5 shrink-0"><Icon name="check" size={13} /></span>
                <span>Booking conflicts, resource assignments and concurrent-job limits are checked on save.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0"><Icon name="shieldCheck" size={13} /></span>
                <span>Travel feasibility includes estimated transit and a 45-minute setup buffer.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5 shrink-0"><Icon name="calendar" size={13} /></span>
                <span className="text-red-700 font-medium">Existing confirmed STARVNT bookings cannot be overridden by a block.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Blocked Dates Registry Card (All Blockouts from DB) */}
      <Card className="mt-5" title={`Blocked Dates Registry (${blockouts.length} active in DB)`}>
        {blockouts.length === 0 ? (
          <p className="text-xs text-muted">No availability blocks or external commitments recorded. Booking eligibility still depends on capacity and verification.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {blockouts.map((bl) => (
              <div key={bl._id} className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-200 flex items-center justify-between gap-2 shadow-2xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    <span className="text-xs font-black text-red-900">{bl.date}{bl.endDate && bl.endDate !== bl.date ? ` – ${bl.endDate}` : ''}</span>
                  </div>
                  <div className="text-[11px] text-red-800 font-bold mt-0.5">{bl.recordType || 'VENDOR_BLOCK'} · {bl.scope || 'BUSINESS'}<br />Reason: {bl.reason || 'Unavailable'}</div>
                  <div className="text-[10px] text-red-600">{bl.allDay ? 'All Day Slot' : `${bl.startTime} - ${bl.endTime}`}</div>
                </div>
                <button
                  onClick={() => { if (bl.sourceModel === 'VendorBookingSlot') { handleDeleteBlockout(bl._id); return; } setEditing(bl); setShowBlockModal(true); }}
                  className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 hover:text-red-900 transition"
                  title={bl.sourceModel === 'VendorBookingSlot' ? 'Cancel legacy commitment' : 'Edit record'}
                  aria-label={bl.sourceModel === 'VendorBookingSlot' ? 'Cancel legacy commitment' : 'Edit record'}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ServiceResources services={services} resources={resources} onSaved={loadCalendarData} />
      <NotificationPreferences surface="vendor" />
      {showBlockModal && <div className="vendor-modal-backdrop"><div role="dialog" aria-modal="true" aria-label="Availability record" className="vendor-modal-panel max-w-xl p-5 max-h-[90vh] overflow-auto"><CommitmentForm initial={editing} services={services} resources={resources} onSaved={() => { setShowBlockModal(false); loadCalendarData(); }} onCancel={() => setShowBlockModal(false)} /></div></div>}
    </Page>
  );
}
