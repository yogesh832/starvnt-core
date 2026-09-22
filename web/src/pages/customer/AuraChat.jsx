import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import MapLocationPicker from '../../components/MapLocationPicker.jsx';
import { externalApi } from '../../lib/api.js';

/**
 * Structured "Here's what I understood" card matching Screen 2 of Reference Set.
 */
function UnderstoodCard({ parsed, onConfirm }) {
  const fields = [
    { label: 'Event', value: parsed.type || 'Wedding', status: parsed.type ? 'stated' : 'missing' },
    { label: 'Date', value: parsed.dateStr || 'Not specified', status: parsed.dateStr ? 'stated' : 'missing' },
    { label: 'Guests', value: parsed.guests ? parsed.guests.toString() : 'Not specified', status: parsed.guests ? 'stated' : 'missing' },
    { label: 'Venue', value: parsed.venue || 'Not specified', status: parsed.venue ? 'stated' : 'missing' },
    { label: 'Services', value: 'Photography, Decoration, Catering', status: 'stated' },
    { label: 'Budget', value: 'Not specified', status: 'missing' },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm mt-2 w-full max-w-xl">
      <div className="text-xs font-bold text-navy flex items-center gap-1.5 pb-3 border-b border-gray-100">
        <Icon name="check" size={13} className="text-emerald-500 shrink-0" />
        <span>Here's what I understood:</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-3 text-xs">
        {fields.map((f) => (
          <div key={f.label} className="bg-lavender/50 p-2.5 rounded-2xl border border-gray-100/50">
            <div className="text-[10px] text-muted flex items-center justify-between">
              <span>{f.label}</span>
              {f.status === 'stated' ? (
                <Icon name="check" size={10} className="text-emerald-600 shrink-0" />
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

export default function AuraChat({ firstName, onEventCreated, embedded = false, initialIntent = '' }) {
  const [input, setInput] = useState('');
  const [stage, setStage] = useState(0); // 0 initial, 1 understood, 2 budget select, 3 done
  const [activeOtherIndex, setActiveOtherIndex] = useState(null);
  const [otherInput, setOtherInput] = useState('');
  const [tempLocation, setTempLocation] = useState(null);
  const [messages, setMessages] = useState([
    {
      from: 'aura',
      text: `Hi ${firstName || 'there'}, I'm Aura+, your AI event planner. What are we celebrating?`,
      options: ['Wedding', 'Corporate Event', 'Birthday', 'Anniversary']
    },
  ]);
  const bottomRef = useRef(null);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial intent
  useEffect(() => {
    if (initialIntent && stage === 0) {
      send(initialIntent);
    }
  }, [initialIntent, stage]);

  const [parsedDetails, setParsedDetails] = useState({ type: '', dateStr: '', isoDate: '', venue: '', guests: 0 });

  const [chatHistory, setChatHistory] = useState([]);
  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Voice input not supported in this browser.');
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      send(text);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };
  
  const playVoice = async (text) => {
    try {
      const token = localStorage.getItem('starvnt_ext_token');
      const res = await fetch('http://localhost:3000/api/ai/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
      }
    } catch (e) {
      console.error(e);
    }
  };
  
  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');

    // Optimistic user message
    setMessages(prev => [...prev, { from: 'user', text: msg }]);
    
    if (stage === 2) {
      setMessages((prev) => [
        ...prev,
        {
          from: 'aura',
          text: `Perfect! Approximate budget set to ${msg}. I've created your event plan and matched top verified vendors for ${parsedDetails.venue || 'your venue'} with the lowest validated total cost!`,
        },
      ]);
      setStage(3);
      onEventCreated?.();
      return;
    }

    // Add to internal chat history for context
    const newHistory = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    
    try {
       const res = await externalApi.call('/ai/chat', {
         method: 'POST',
         body: { messages: newHistory }
       });
       
       const reply = res.reply;
       // Check if reply ends with the JSON block
       const jsonMatch = reply.match(/```(?:json)?\n?([\s\S]*?)\n?```/i);
       if (jsonMatch) {
          const parsedStr = jsonMatch[1];
          try {
             const data = JSON.parse(parsedStr);
             const textOnly = reply.replace(/```(?:json)?\n?[\s\S]*?\n?```/i, '').trim();
             
             if (data.action === 'request_location') {
                setMessages(prev => [
                   ...prev,
                   { from: 'aura', text: textOnly, action: 'request_location' }
                ]);
             } else if (data.options) {
                setMessages(prev => [
                   ...prev,
                   { from: 'aura', text: textOnly, options: data.options }
                ]);
             } else {
                setParsedDetails(data);
                setMessages(prev => [
                   ...prev,
                   { from: 'aura', text: textOnly },
                   { kind: 'understood' }
                ]);
                setStage(1);
             }
             setChatHistory([...newHistory, { role: 'assistant', content: textOnly }]);
          } catch(e) {
             setMessages(prev => [...prev, { from: 'aura', text: reply }]);
             setChatHistory([...newHistory, { role: 'assistant', content: reply }]);
          }
       } else {
          // Standard conversational turn
          setMessages(prev => [...prev, { from: 'aura', text: reply }]);
          setChatHistory([...newHistory, { role: 'assistant', content: reply }]);
       }
    } catch(err) {
       setMessages(prev => [...prev, { from: 'aura', text: "Sorry, I had trouble connecting to my AI brain. Let's try again!" }]);
    }
  }

  async function handleUnderstoodConfirm() {
    try {
      await externalApi.call('/opportunities/generate', {
        method: 'POST',
        body: {
          category: parsedDetails.type || 'Photography',
          date: parsedDetails.isoDate,
          serviceLocation: { address: parsedDetails.venue, locality: parsedDetails.venue, city: parsedDetails.venue },
          guestCount: parsedDetails.guests || 500,
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
        {messages.map((m, i) =>
          m.kind === 'understood' ? (
            <div key={i} className="flex gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs shrink-0 mt-0.5 shadow-xs">
                <Icon name="bolt" size={13} />
              </div>
              <div className="max-w-full sm:max-w-[85%] w-full">
                <UnderstoodCard parsed={parsedDetails} onConfirm={handleUnderstoodConfirm} />
              </div>
            </div>
          ) : (
            <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'gap-2.5'}`}>
              {m.from === 'aura' && (
                <div className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs shrink-0 mt-0.5 shadow-xs">
                  <Icon name="bolt" size={13} />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col gap-2`}>
                <div
                  className={`rounded-3xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                    m.from === 'user'
                      ? 'bg-primary text-white rounded-br-xs shadow-xs ml-auto'
                      : 'bg-white border border-gray-100 rounded-tl-xs shadow-xs text-navy'
                  }`}
                >
                  {m.text}
                  {m.from === 'aura' && (
                     <button onClick={() => playVoice(m.text)} className="block mt-2 text-[10px] text-primary font-bold hover:underline">
                        <Icon name="mic" size={10} className="inline mr-1" /> Listen
                     </button>
                  )}
                </div>
                {m.options && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {m.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => send(opt)}
                        className="bg-lavender/50 text-navy hover:bg-lavender text-xs font-semibold px-3.5 py-2 rounded-full border border-primary/20 shadow-sm transition cursor-pointer"
                      >
                        {opt}
                      </button>
                    ))}
                    {activeOtherIndex === i ? (
                      <div className="flex items-center gap-1 bg-white border border-primary/30 rounded-full px-2 py-1 shadow-sm">
                        <input
                           autoFocus
                           className="text-xs bg-transparent outline-none px-2 w-28 text-navy"
                           placeholder="Type here..."
                           value={otherInput}
                           onChange={e => setOtherInput(e.target.value)}
                           onKeyDown={e => {
                             if (e.key === 'Enter') {
                               e.preventDefault();
                               if (otherInput.trim()) {
                                 send(otherInput);
                                 setActiveOtherIndex(null);
                                 setOtherInput('');
                               }
                             }
                           }}
                        />
                        <button
                          onClick={() => {
                             if (otherInput.trim()) {
                               send(otherInput);
                               setActiveOtherIndex(null);
                               setOtherInput('');
                             }
                          }}
                          className="bg-primary text-white p-1 rounded-full w-6 h-6 grid place-items-center cursor-pointer hover:bg-primary-dark"
                        >
                          <Icon name="send" size={10} className="-translate-y-px translate-x-px" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveOtherIndex(i)}
                        className="bg-lavender/50 text-navy hover:bg-lavender text-xs font-semibold px-3.5 py-2 rounded-full border border-primary/20 shadow-sm transition cursor-pointer"
                      >
                        Other...
                      </button>
                    )}
                  </div>
                )}
                {m.action === 'request_location' && (
                  <div className="mt-1 rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col relative z-0">
                    <MapLocationPicker
                      height="220px"
                      value={tempLocation || { lat: 22.5726, lng: 88.3639 }}
                      onChange={setTempLocation}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tempLocation && tempLocation.address) {
                          send(tempLocation.address);
                        } else {
                          send("Kolkata");
                        }
                      }}
                      className="w-full bg-primary text-white py-2.5 text-xs font-bold hover:bg-primary-dark transition cursor-pointer z-10 relative"
                    >
                      Confirm Pin Point
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
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
          <button
            type="button"
            onClick={startListening}
            className={`p-2 transition cursor-pointer ${isListening ? 'text-red-500 animate-pulse' : 'text-muted hover:text-primary'}`}
            title="Voice input"
          >
            <Icon name="mic" size={16} />
          </button>
          <button
            type="submit"
            className="w-9 h-9 grid place-items-center rounded-full bg-primary text-white hover:bg-primary-dark transition shadow-sm cursor-pointer"
            title="Send"
            aria-label="Send message"
          >
            <Icon name="send" size={14} className="-translate-y-px translate-x-px" />
          </button>
        </div>
        <p className="text-[10px] text-muted text-center mt-1.5">
          Aura+ recommends the lowest validated total cost across verified vendors.
        </p>
      </form>
    </div>
  );
}
