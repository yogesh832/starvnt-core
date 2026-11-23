import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import EventCollaboration from '../../../components/EventCollaboration.jsx';
import { Page, Card } from './shared.jsx';

export default function ClientGalleries() {
  const [bookings, setBookings] = useState([]), [selected, setSelected] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const generation = useRef(0);
  async function refresh() {
    const request = ++generation.current; setLoading(true); setError('');
    try {
      const result = await externalApi.call('/vendor/workflow/bookings');
      if (!result.ok || !Array.isArray(result.bookings)) throw new Error('Assigned event records are unavailable.');
      if (request === generation.current) setBookings(result.bookings.filter(row => row.customerEvent && row.bookingStatus === 'CONFIRMED' && row.paymentStatus === 'PAYMENT_VERIFIED'));
    } catch (err) { if (request === generation.current) setError(err.data?.message || err.message); }
    finally { if (request === generation.current) setLoading(false); }
  }
  useEffect(() => { refresh(); return () => { generation.current++; }; }, []);
  const booking = bookings.find(row => row._id === selected);
  return <Page title="Client Galleries & Memories" sub="Private media for your assigned events. Keep public portfolio publishing separate." action={<button className="min-h-11 rounded-xl border px-4 text-sm" onClick={refresh} disabled={loading}>Refresh events</button>}>
    <Card><h2 className="font-bold">A private space for every event</h2><p className="text-sm text-muted mt-2">Select a verified, assigned booking before uploading. Rights confirmation, private access and authorized publication review apply to each event. No gallery is made public merely because it is delivered.</p><Link className="inline-flex min-h-11 items-center text-primary text-sm underline" to="/vendor/portfolio">Manage public portfolio separately →</Link></Card>
    {error && <div role="alert" className="vendor-source-notice">{error}<button className="block" onClick={refresh}>Retry assigned events</button></div>}
    {loading && <p role="status" className="text-sm text-muted">Refreshing assigned events…</p>}
    {!loading && !error && !bookings.length && <Card><h2 className="font-bold">Your event galleries will live here</h2><p className="text-sm text-muted mt-2">A linked, verified Core booking and current vendor assignment are required. External bookings do not unlock customer gallery access.</p><Link className="inline-flex min-h-11 items-center text-sm text-primary" to="/vendor/bookings">View bookings →</Link></Card>}
    <div className="grid sm:grid-cols-2 gap-3">{bookings.map(row => <button key={row._id} className={`text-left min-h-24 rounded-2xl border p-4 ${row._id === selected ? 'border-primary bg-primary-soft' : 'bg-white'}`} onClick={() => setSelected(row._id)}><span className="text-xs text-muted">{row.bookingReference} · {row.eventDate}</span><strong className="block text-sm mt-1">{row.serviceName}</strong><span className="inline-flex mt-3 rounded-full bg-primary-soft text-primary text-xs px-3 py-1">Open private workspace →</span></button>)}</div>
    {booking && !error && <EventCollaboration key={booking._id} bookingId={booking._id} eventId={booking.customerEvent} />}
  </Page>;
}
