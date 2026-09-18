import { useState, useEffect, useCallback } from 'react';
import { Page, Card, EmptyHint } from './shared.jsx';
import { externalApi } from '../../../lib/api.js';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 10, 1)); // Default Nov 2026
  const [selectedDay, setSelectedDay] = useState(26);
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
    const d = new Date(b.eventDate);
    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
      const dayNum = d.getDate();
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
    const d = new Date(bl.date);
    if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
      const dayNum = d.getDate();
      eventsByDay[dayNum] = eventsByDay[dayNum] || [];
      eventsByDay[dayNum].push({
        id: bl._id,
        title: bl.reason || 'Blocked Out',
        time: bl.allDay ? 'All day' : `${bl.startTime} - ${bl.endTime}`,
        place: 'Blocked by Vendor',
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
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-xs"
        >
          + Block Date
        </button>
      }
    >
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-navy text-base">{monthTitle}</h2>
            <div className="flex gap-1 text-muted">
              <button
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-lavender grid place-items-center font-bold"
              >
                ‹
              </button>
              <button
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-lavender grid place-items-center font-bold"
              >
                ›
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-muted font-semibold py-2">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
            {days.map((d) => {
              const dayEvents = eventsByDay[d];
              const hasBooking = dayEvents?.some((e) => e.type === 'BOOKING');
              const hasBlockout = dayEvents?.some((e) => e.type === 'BLOCKOUT');

              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition relative ${
                    selectedDay === d
                      ? 'bg-primary text-white font-bold shadow-xs'
                      : hasBooking
                      ? 'bg-primary-soft text-primary font-semibold'
                      : hasBlockout
                      ? 'bg-red-50 text-red-500 font-semibold'
                      : 'hover:bg-lavender text-ink/70'
                  }`}
                >
                  {d}
                  {hasBooking && selectedDay !== d && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                  {hasBlockout && !hasBooking && selectedDay !== d && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title={`Events — ${selectedDay} ${monthNames[month]}`}>
            {selectedEvents.length === 0 && (
              <EmptyHint text="No bookings or blockouts this day. Slot is commercially free." />
            )}
            <ul className="space-y-2.5">
              {selectedEvents.map((e) => (
                <li
                  key={e.id}
                  className={`border rounded-xl p-3 text-xs ${
                    e.type === 'BLOCKOUT' ? 'border-red-100 bg-red-50/50' : 'border-gray-100 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[13px] text-navy">{e.title}</span>
                    {e.type === 'BLOCKOUT' && (
                      <button
                        onClick={() => handleDeleteBlockout(e.id)}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        Unblock
                      </button>
                    )}
                  </div>
                  <div className="text-muted mt-1">{e.time} · {e.place}</div>
                  {e.amount && <div className="text-primary font-semibold mt-1">{e.amount}</div>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Feasibility & Transit Policy">
            <ul className="space-y-2 text-xs text-muted">
              <li className="flex gap-2">
                <span className="text-emerald-500">✓</span>
                All active bookings are strictly validated against transit buffer and team limit.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500">⚠</span>
                Back-to-back bookings require minimum 2-hour buffer between different localities.
              </li>
              <li className="flex gap-2">
                <span className="text-primary">ℹ</span>
                Blocked dates are automatically excluded from customer search matching.
              </li>
            </ul>
          </Card>
        </div>
      </div>

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
                  value={newBlockoutDate}
                  onChange={(e) => setNewBlockoutDate(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2 font-bold text-navy outline-none"
                />
              </div>
              <div>
                <label className="block text-muted font-semibold mb-1">Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Vacation, Equipment maintenance"
                  value={newBlockoutReason}
                  onChange={(e) => setNewBlockoutReason(e.target.value)}
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
