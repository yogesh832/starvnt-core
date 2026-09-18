import { useState } from 'react';
import { Page, Card, EmptyHint } from './shared.jsx';

const THREADS = [
  { name: 'Riya Sharma', event: 'Wedding · 28 Nov', preview: 'Can we add a second shooter for haldi?', time: '2h', unread: 2, online: true },
  { name: 'STARVNT Support', event: 'Account', preview: 'Your payout of ₹25,000 was processed.', time: '5h', unread: 1, online: false },
  { name: 'Ananya Gupta', event: 'Birthday · 5 Feb', preview: 'The theme is "Vintage Bollywood" 🎬', time: '1d', unread: 0, online: false },
  { name: 'Mehta Group', event: 'Corporate · 20 Jan', preview: 'Please share the pre-event checklist.', time: '2d', unread: 0, online: false },
];

const CONVERSATION = [
  { from: 'them', text: 'Hi! We loved the portfolio. Can we add a second shooter for the haldi ceremony?', time: '10:42 AM' },
  { from: 'me', text: 'Absolutely — a second photographer is ₹8,000 for the haldi. Want me to update the quote?', time: '10:47 AM' },
  { from: 'them', text: 'Yes please! Also — can coverage start 30 mins early?', time: '11:02 AM' },
];

export default function Messages() {
  const [active, setActive] = useState(THREADS[0]);
  const [msg, setMsg] = useState('');
  const [thread, setThread] = useState(CONVERSATION);

  function send(e) {
    e.preventDefault();
    if (!msg.trim()) return;
    setThread([...thread, { from: 'me', text: msg.trim(), time: 'now' }]);
    setMsg('');
  }

  return (
    <Page title="Messages" sub="Customers, STARVNT support and booking conversations.">
      <div className="grid lg:grid-cols-[300px_1fr] gap-0 bg-white rounded-2xl shadow-sm overflow-hidden min-h-[480px]">
        {/* Thread list */}
        <div className="border-r border-gray-100 overflow-y-auto">
          {THREADS.map((t) => (
            <button
              key={t.name}
              onClick={() => setActive(t)}
              className={`w-full flex items-center gap-3 p-4 text-left transition border-b border-gray-50 ${active.name === t.name ? 'bg-primary-soft/60' : 'hover:bg-lavender'}`}
            >
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-primary grid place-items-center text-xs font-bold">
                  {t.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                {t.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-bold truncate">{t.name}</span>
                  <span className="text-[10px] text-muted">{t.time}</span>
                </div>
                <div className="text-[10px] text-primary font-medium">{t.event}</div>
                <div className="text-xs text-muted truncate">{t.preview}</div>
              </div>
              {t.unread > 0 && <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4.5 h-4.5 px-1.5 py-0.5">{t.unread}</span>}
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className="flex flex-col">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-soft text-primary grid place-items-center text-xs font-bold">
              {active.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div className="text-sm font-bold">{active.name}</div>
              <div className="text-[10px] text-muted">{active.event}</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-lavender/50">
            {thread.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${m.from === 'me' ? 'bg-primary text-white rounded-br-md' : 'bg-white shadow-sm rounded-bl-md'}`}>
                  <div>{m.text}</div>
                  <div className={`text-[9px] mt-1 ${m.from === 'me' ? 'text-white/60 text-right' : 'text-muted'}`}>{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="p-3 border-t border-gray-100 flex gap-2">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message..." className="flex-1 rounded-xl bg-lavender px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            <button className="rounded-xl bg-primary hover:bg-primary-dark text-white px-5 font-semibold text-sm transition">Send</button>
          </form>
        </div>
      </div>
      <EmptyHint text="Messaging is contextual to bookings — sensitive KYC/payment details are never shared here." />
    </Page>
  );
}
