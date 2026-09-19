import { useState, useEffect, useCallback } from 'react';
import { Page, Card, EmptyHint } from './shared.jsx';
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
  const [newBlockoutDate, setNewBlockoutDate] = useState('');
  const [newBlockoutReason, setNewBlockoutReason] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);

  const loadCalendarData = useCallback(async () => {
    try {
      const [bkRes, blRes] = await Promise.all([
        externalApi.call('/vendor/bookings'),
        externalApi.call('/vendor/availability/blockouts'),
      ]);

      if (bkRes.ok && bkRes.bookings) {
        setBookings(bkRes.bookings);
      }
      if (blRes.ok && blRes.blockouts) {
        setBlockouts(blRes.blockouts);
      }
    } catch (err) {
      console.warn('[CalendarPage] Failed to fetch live calendar data:', err.message);
    }
  }, []);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  async function handleAddBlockout(e) {
    e.preventDefault();
    if (!newBlockoutDate) return;
    try {
      await externalApi.call('/vendor/availability/blockouts', {
        method: 'POST',
        body: {
          date: newBlockoutDate,
          reason: newBlockoutReason || 'Unavailable',
          allDay: true,
        },
      });
      setShowBlockModal(false);
      setNewBlockoutDate('');
      setNewBlockoutReason('');
      await loadCalendarData();
    } catch (err) {
      alert(`Could not block date: ${err.message}`);
    }
  }

  async function handleDeleteBlockout(id) {
    if (!confirm('Are you sure you want to unblock this date?')) return;
    try {
      await externalApi.call(`/vendor/availability/blockouts/${id}`, { method: 'DELETE' });
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
    const parsed = parseLocalDate(bl.date);
    if (parsed && parsed.year === year && parsed.month === month) {
      const dayNum = parsed.day;
      eventsByDay[dayNum] = eventsByDay[dayNum] || [];
      eventsByDay[dayNum].push({
        id: bl._id,
        date: bl.date,
        reason: bl.reason || 'Unavailable',
        title: `Blocked: ${bl.reason || 'Unavailable'}`,
        time: bl.allDay ? 'All day' : `${bl.startTime} - ${bl.endTime}`,
        place: 'Blocked Date (Unavailable for matching)',
        type: 'BLOCKOUT',
      });
    }
  });

  const selectedEvents = eventsByDay[selectedDay] || [];

  return (
    <Page
      title="Calendar"
      sub="Operational feasibility view — calendar + travel + team + equipment together."
      action={
        <button
          onClick={() => setShowBlockModal(true)}
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-xs inline-flex items-center gap-1.5 hover:bg-primary-dark transition"
        >
          <Icon name="plus" size={14} /> Block Date
        </button>
      }
    >
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
              <EmptyHint text="No bookings or blockouts on this day. Slot is commercially free." />
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
                      Excluded from client search matching and Aura+ recommendations.
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
                <span>All active bookings are strictly validated against transit buffer and team limit.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0"><Icon name="shieldCheck" size={13} /></span>
                <span>Back-to-back bookings require minimum 2-hour buffer between different localities.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5 shrink-0"><Icon name="calendar" size={13} /></span>
                <span className="text-red-700 font-medium">Blocked dates are excluded from customer search matching before proposals run.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Blocked Dates Registry Card (All Blockouts from DB) */}
      <Card className="mt-5" title={`Blocked Dates Registry (${blockouts.length} active in DB)`}>
        {blockouts.length === 0 ? (
          <p className="text-xs text-muted">No blocked dates currently registered. All calendar slots are open for client bookings.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {blockouts.map((bl) => (
              <div key={bl._id} className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-200 flex items-center justify-between gap-2 shadow-2xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    <span className="text-xs font-black text-red-900">{bl.date}</span>
                  </div>
                  <div className="text-[11px] text-red-800 font-bold mt-0.5">Reason: {bl.reason || 'Unavailable'}</div>
                  <div className="text-[10px] text-red-600">{bl.allDay ? 'All Day Slot' : `${bl.startTime} - ${bl.endTime}`}</div>
                </div>
                <button
                  onClick={() => handleDeleteBlockout(bl._id)}
                  className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 hover:text-red-900 transition"
                  title="Unblock date"
                  aria-label="Unblock"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal for Blocking Date */}
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
                <label className="block text-muted font-semibold mb-1">Date to Block</label>
                <input
                  type="date"
                  required
                  value={newBlockoutDate}
                  onChange={(e) => setNewBlockoutDate(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Vacation, Maintenance, Personal"
                  value={newBlockoutReason}
                  onChange={(e) => setNewBlockoutReason(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-medium text-navy outline-none focus:border-primary"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition"
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
