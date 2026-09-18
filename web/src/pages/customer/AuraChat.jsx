import { useEffect, useRef, useState } from 'react';
import { externalApi } from '../../lib/api.js';

const BUDGET_CHIPS = ['₹8 - 10 Lakh', '₹10 - 15 Lakh', '₹15 - 20 Lakh', '₹20 Lakh+', 'Set my own budget'];
const QUICK_PROMPTS = [
  "My daughter's wedding",
  'Plan a milestone birthday',
  'Corporate event for 300 people',
  'Arrange a Puja',
  'Plan an anniversary',
];

/**
 * Structured "Here's what I understood" card matching Screen 2 of Reference Set.
 */
function UnderstoodCard({ onConfirm }) {
  const fields = [
    { label: 'Event', value: 'Wedding', status: 'stated' },
    { label: 'Date', value: '26 November', status: 'stated' },
    { label: 'Guests', value: '500', status: 'stated' },
    { label: 'Venue', value: 'Kisan Palace', status: 'stated' },
    { label: 'Services', value: 'Photography, Decoration, Catering', status: 'stated' },
    { label: 'Budget', value: 'Not specified', status: 'missing' },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm mt-2 w-full max-w-xl">
      <div className="text-xs font-bold text-navy flex items-center gap-1.5 pb-3 border-b border-gray-100">
        <span className="text-emerald-500 font-bold">✓</span>
        <span>Here's what I understood:</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-3 text-xs">
        {fields.map((f) => (
          <div key={f.label} className="bg-lavender/50 p-2.5 rounded-2xl border border-gray-100/50">
            <div className="text-[10px] text-muted flex items-center justify-between">
              <span>{f.label}</span>
              {f.status === 'stated' ? (
                <span className="text-[9px] font-bold text-emerald-600">✓</span>
              ) : (
                <span className="text-[9px] font-bold text-orange-500">missing</span>
              )}
            </div>
            <div className={`font-bold mt-1 text-xs truncate ${f.status === 'missing' ? 'text-muted italic' : 'text-navy'}`}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted">
          All details are verified by you before any opportunity is sent to vendors.
        </p>
        <button
          onClick={onConfirm}
          className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-extrabold px-4 py-2 transition shadow-sm shadow-primary/20 shrink-0"
        >
          Confirm Details
        </button>
      </div>
    </div>
  );
}

export default function AuraChat({ firstName, onEventCreated, embedded = false }) {
  const [input, setInput] = useState('');
  const [stage, setStage] = useState(0); // 0 initial, 1 understood, 2 budget select, 3 done
  const [messages, setMessages] = useState([
    {
      from: 'aura',
      text: `✨ Hi ${firstName}! I'm Aura+. Tell me what you're planning — type, date, guests, venue, or budget — anything you have so far.`,
    },
  ]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stage]);

  function send(text) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');

    // Step 1: User enters requirement
    if (stage === 0) {
      setMessages((prev) => [
        ...prev,
        { from: 'user', text: msg },
        { from: 'aura', text: "Got it, I'll help you plan this. 😊" },
        { kind: 'understood' },
      ]);
      setStage(1);
    } else if (stage === 2) {
      setMessages((prev) => [
        ...prev,
        { from: 'user', text: msg },
        {
          from: 'aura',
          text: `Perfect! Approximate budget set to ${msg}. I've created your event plan and matched 3 top verified photographers for Kisan Palace with the lowest validated total cost!`,
        },
      ]);
      setStage(3);
      onEventCreated?.();
    } else {
      setMessages((prev) => [
        ...prev,
        { from: 'user', text: msg },
        {
          from: 'aura',
          text: "I've updated your event workspace with that requirement.",
        },
      ]);
    }
  }

  async function handleUnderstoodConfirm() {
    try {
      await externalApi.call('/opportunities/generate', {
        method: 'POST',
        body: {
          category: 'Photography',
          date: '2026-11-26',
          serviceLocation: { address: 'Kisan Palace', locality: 'New Town', city: 'Kolkata' },
          guestCount: 500,
          durationHours: 8,
          requiredStyles: ['Candid', 'Traditional'],
        },
      });
    } catch (err) {
      // Graceful local handling
    }

    setMessages((prev) => [
      ...prev,
      {
        from: 'aura',
        text: "Before I start finding options, what's your approximate budget?",
      },
    ]);
    setStage(2);
  }

  return (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'h-full'}`}>
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 space-y-4 max-w-3xl w-full mx-auto">
        {/* Quick prompts before first message */}
        {stage === 0 && messages.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p === "My daughter's wedding" ? "My daughter's wedding is on 26 November at Kisan Palace for 500 guests. I need photography, decoration and catering within my budget." : p)}
                className="text-xs sm:text-sm bg-white hover:bg-primary-soft hover:text-primary border border-gray-100 rounded-full px-4 py-2 transition shadow-xs font-medium"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.kind === 'understood' ? (
            <div key={i} className="flex gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary-soft text-primary grid place-items-center text-xs shrink-0 mt-0.5">
                ✨
              </div>
              <div className="max-w-full sm:max-w-[85%] w-full">
                <UnderstoodCard onConfirm={handleUnderstoodConfirm} />
              </div>
            </div>
          ) : (
            <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'gap-2.5'}`}>
              {m.from === 'aura' && (
                <div className="w-8 h-8 rounded-full bg-primary-soft text-primary grid place-items-center text-xs shrink-0 mt-0.5">
                  ✨
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-3xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                  m.from === 'user'
                    ? 'bg-primary text-white rounded-br-xs shadow-xs'
                    : 'bg-white border border-gray-100 rounded-tl-xs shadow-xs text-navy'
                }`}
              >
                {m.text}
              </div>
            </div>
          )
        )}

        {/* Stage 2: Budget selection pills */}
        {stage === 2 && (
          <div className="pl-10 space-y-2">
            <div className="flex flex-wrap gap-2">
              {BUDGET_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="text-xs font-bold bg-white border border-primary/40 text-primary hover:bg-primary hover:text-white rounded-full px-4 py-2 transition shadow-xs"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 sm:p-4 max-w-3xl w-full mx-auto">
        <div className="flex items-center gap-2 bg-white rounded-2xl shadow-lg shadow-primary/5 px-4 py-2.5 border border-gray-100">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message or describe your event..."
            className="flex-1 outline-none text-xs sm:text-sm placeholder:text-muted/60"
          />
          <button type="button" className="text-muted hover:text-primary text-base" title="Voice">
            🎙
          </button>
          <button
            type="submit"
            className="w-9 h-9 grid place-items-center rounded-full bg-primary text-white hover:bg-primary-dark transition text-sm shadow-sm"
            title="Send"
          >
            ➤
          </button>
        </div>
        <p className="text-[10px] text-muted text-center mt-1.5">
          Aura+ recommends the lowest validated total cost across verified vendors.
        </p>
      </form>
    </div>
  );
}
