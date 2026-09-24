import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { EventCard, useLoad } from './customerUi.jsx';

const CLOSED = ['completed', 'cancelled'];

export default function MePage({ user, logout }) {
  const profile = useLoad(() => customerApi.profile(), []);
  const events = useLoad(() => customerApi.events(), []);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const p = profile.data?.profile || user;
  const all = events.data?.events || [];
  const active = all.filter((e) => !CLOSED.includes(e.status));
  const past = all.filter((e) => CLOSED.includes(e.status));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await customerApi.patchProfile({ fullName: form.fullName, phone: form.phone });
      profile.setData(r);
      setEditing(false);
    } catch (err) {
      const f = err?.data?.fields;
      setError(f ? Object.values(f).join(' · ') : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-lg font-extrabold shrink-0">
          {p?.fullName?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-base truncate">{p?.fullName}</div>
          <div className="text-xs text-muted truncate">{p?.email}</div>
          {p?.phone && <div className="text-xs text-muted truncate">{p.phone}</div>}
        </div>
        <button
          onClick={() => {
            setForm({ fullName: p?.fullName || '', phone: p?.phone || '' });
            setEditing((v) => !v);
          }}
          className="text-xs font-bold rounded-xl border border-gray-200 px-3 py-2 text-navy"
        >
          Edit profile
        </button>
      </div>

      {editing && (
        <form onSubmit={save} className="bg-white rounded-2xl shadow-sm p-4 grid gap-2.5 text-xs">
          <label>
            <span className="text-[10px] text-muted">Name</span>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-primary" />
          </label>
          <label>
            <span className="text-[10px] text-muted">Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-primary" />
          </label>
          {error && <div className="text-red-500">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="font-bold text-muted px-3">Cancel</button>
            <button disabled={busy} className="rounded-xl bg-primary text-white font-bold px-4 py-2 disabled:opacity-60">Save</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Events', all.length], ['Active', active.length], ['Past', past.length]].map(([k, v]) => (
          <div key={k} className="bg-white rounded-2xl shadow-sm py-3">
            <div className="text-lg font-extrabold text-navy">{v}</div>
            <div className="text-[10px] text-muted">{k}</div>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <section>
          <div className="text-sm font-extrabold text-navy mb-2">My events</div>
          <div className="grid gap-2">{active.map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <div className="text-sm font-extrabold text-navy mb-2">Past events</div>
          <div className="grid gap-2">{past.map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-2">
        {[
          ['bell', 'Messages & updates', '/customer/updates'],
          ['star', 'Talk to Aura+', '/customer/aura'],
        ].map(([icon, label, to]) => (
          <Link key={label} to={to} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-lavender text-xs font-semibold text-navy">
            <Icon name={icon} size={14} className="text-primary" /> {label}
            <span className="ml-auto text-muted">›</span>
          </Link>
        ))}
      </div>

      <button onClick={logout} className="w-full rounded-2xl bg-white text-red-500 text-sm font-bold py-3.5 shadow-sm hover:bg-red-50 transition">Log out</button>
    </div>
  );
}
