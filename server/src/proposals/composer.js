/**
 * Proposal HTML composer. One template system feeds both the A4 PDF and the
 * admin live preview. Everything is real text; only photos are raster.
 *
 * Sections are chosen from the customer-safe snapshot: a section exists only
 * when its scope exists, and the order depends on the event family.
 */

export const PRELIMINARY_WATERMARK = 'PRELIMINARY — NOT A FINAL APPROVED PROPOSAL';

export const THEMES = {
  'royal-luxury': { label: 'Royal Luxury', primary: '#5B1F2E', accent: '#B8925A', paper: '#FBF6EE', ink: '#1C1A19', muted: '#6E6660', line: '#E7DCCB' },
  'soft-ivory': { label: 'Soft Ivory Editorial', primary: '#6B4E3D', accent: '#B89B72', paper: '#FFFCF7', ink: '#2A2522', muted: '#7A706A', line: '#EDE4D8' },
  'bengali-traditional': { label: 'Bengali Traditional', primary: '#8E1B1B', accent: '#C9A227', paper: '#FFF8EC', ink: '#231A14', muted: '#6F5F52', line: '#EBD9BE' },
  'contemporary-minimal': { label: 'Contemporary Minimal', primary: '#22252A', accent: '#A68A64', paper: '#FFFFFF', ink: '#16181B', muted: '#6B7078', line: '#E4E6E9' },
  'corporate-premium': { label: 'Corporate Premium', primary: '#1F2A44', accent: '#B08D57', paper: '#FFFFFF', ink: '#141A26', muted: '#5E6675', line: '#DFE3EA' },
  'modern-concert': { label: 'Modern Concert', primary: '#2B1740', accent: '#C08B4C', paper: '#FCFAFF', ink: '#17101F', muted: '#6C6378', line: '#E6E0EE' },
};

const FAMILY_ORDER = {
  wedding: ['venue', 'catering', 'decor', 'ceremony', 'makeup', 'entertainment', 'sound', 'special_effects', 'photography', 'hospitality', 'transport', 'accommodation', 'invitation', 'anchor', 'photo_booth', 'live_streaming'],
  birthday: ['venue', 'decor', 'cake', 'catering', 'entertainment', 'anchor', 'sound', 'photography', 'photo_booth', 'special_effects'],
  corporate: ['venue', 'corporate_production', 'sound', 'live_streaming', 'catering', 'anchor', 'photography', 'transport', 'accommodation', 'invitation', 'hospitality'],
  festival: ['venue', 'sound', 'corporate_production', 'decor', 'entertainment', 'special_effects', 'catering', 'photography', 'transport', 'live_streaming'],
};
const FAMILY_OF = { wedding: 'wedding', anniversary: 'wedding', puja: 'wedding', social: 'birthday', birthday: 'birthday', club: 'festival', cultural: 'festival', corporate: 'corporate', conference: 'corporate', institutional: 'corporate' };

const SECTION_TITLES = {
  catering: ['Catering & Menu', 'Curated flavours for your guests'],
  decor: ['Entrance, Stage & Styling', 'The look and feel of your celebration'],
  photography: ['Photography & Videography', 'Capturing every moment'],
  entertainment: ['Entertainment & Production', 'Moments your guests will remember'],
  sound: ['Sound & Lighting', 'Technical production'],
  corporate_production: ['Stage, AV & Production', 'Professional event production'],
  venue: ['Venue', 'Your event space'],
};

export function familyFor(eventType) {
  return FAMILY_OF[eventType] || 'wedding';
}

export function orderedServices(snapshot) {
  const order = FAMILY_ORDER[familyFor(snapshot.event?.type)];
  const rank = (c) => { const i = order.indexOf(c); return i === -1 ? order.length : i; };
  return [...(snapshot.services || [])].sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category));
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const longDate = (iso) => {
  if (!iso) return 'To be confirmed';
  const d = new Date(`${iso}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'Asia/Kolkata' });
};
const humanize = (key) => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ── Decorative pieces (pure CSS/SVG; no network, no stock imagery) ─────────
const ROSE = (cx, cy, r, petal, core) => `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${petal}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="${core}"/><path d="M${cx - r * 0.45} ${cy} a${r * 0.45} ${r * 0.45} 0 1 1 ${r * 0.45} ${r * 0.45} a${r * 0.28} ${r * 0.28} 0 1 1 ${-r * 0.28} ${-r * 0.3}" fill="none" stroke="${petal}" stroke-width="${r * 0.12}"/></g>`;
function cornerSvg(t) {
  const leaf = (x, y, a) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="2.6" fill="${t.accent}" transform="rotate(${a} ${x} ${y})"/>`;
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${t.accent}" stroke-width="1.3"><path d="M6 8 C38 12 66 30 96 64"/><path d="M8 6 C12 38 30 66 64 96"/></g>`
    + `${leaf(46, 20, 28)}${leaf(70, 40, 40)}${leaf(20, 46, 62)}${leaf(40, 70, 50)}${leaf(86, 56, 48)}${leaf(56, 86, 42)}`
    + `${ROSE(20, 20, 13, '#9E1B2C', '#6E0F1C')}${ROSE(44, 34, 9, '#F3E6CF', '#E2CDA8')}${ROSE(34, 46, 8, '#B3263A', '#7E1422')}${ROSE(62, 18, 6, '#F3E6CF', '#E2CDA8')}${ROSE(18, 62, 6, '#B3263A', '#7E1422')}</svg>`;
}
const ICONS = {
  calendar: '<path d="M4 7h16v13H4z M4 11h16 M8 4v5 M16 4v5"/>',
  pin: '<path d="M12 21s-6-6.2-6-11a6 6 0 1 1 12 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  people: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.4"/><path d="M3.5 19c.6-3.4 3-5 5.5-5s4.9 1.6 5.5 5 M14 15c2.6-.4 5 .9 5.8 4"/>',
  rupee: '<path d="M7 5h10 M7 9h10 M9 5c4.5 0 4.5 8 0 8H7l7 7"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  check: '<path d="M5 12.5l4.2 4L19 7"/>',
  note: '<path d="M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7"/>',
  ban: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',
};
const icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.star}</svg>`;

/** "Event Overview & Planning Approach" → maroon "EVENT OVERVIEW &" / gold "PLANNING APPROACH". */
function twoTone(title) {
  const i = title.lastIndexOf(' & ');
  if (i === -1) return `<span class="t1">${esc(title)}</span>`;
  return `<span class="t1">${esc(title.slice(0, i))} &amp;</span><span class="t2">${esc(title.slice(i + 3))}</span>`;
}
/** Cover title: last word in gold ("WEDDING RECEPTION" / "EXPERIENCE"). */
function coverTitle(title) {
  const words = String(title).trim().split(/\s+/);
  if (words.length < 2) return `<span class="t1">${esc(title)}</span>`;
  return `<span class="t1">${esc(words.slice(0, -1).join(' '))}</span><span class="t2">${esc(words[words.length - 1])}</span>`;
}
const banner = (text, ic = 'star') => `<div class="banner">${icon(ic)}<span>${esc(text)}</span></div>`;
const importantNote = (text) => `<div class="imp"><div class="imp-label">${icon('note')}<span>Important note</span></div><p>${esc(text)}</p></div>`;

function visual(v) {
  if (!v?.url) return '';
  return `<figure class="visual"><img src="${esc(v.url)}" alt="${esc(v.caption || v.label)}" data-source-label="${esc(v.label)}"><figcaption><span class="source">${esc(v.label)}</span>${v.caption ? ` ${esc(v.caption)}` : ''}</figcaption></figure>`;
}

function sectionHeader(title, subtitle) {
  return `<header class="section-head"><h2>${twoTone(title)}</h2>${subtitle ? `<p class="subtitle"><span class="orn">— ✦ —</span> ${esc(subtitle)} <span class="orn">— ✦ —</span></p>` : ''}</header>`;
}

function cover(s, meta) {
  const e = s.event;
  const corner = cornerSvg(theme(meta.theme));
  const hero = (s.visuals?.cover || [])[0];
  const pill = s.customerProvided?.length ? `${s.customerProvided.map((x) => x.label).join(', ')} arranged by you` : (s.exclusions?.[0] ? `${s.exclusions[0]} excluded` : '');
  return `<section class="page cover">
    <div class="cover-panel">
      <h1>${coverTitle(e.title || `${e.typeLabel} Experience`)}</h1>
      <p class="tagline">A coordinated celebration — thoughtfully planned and beautifully presented.</p>
      ${hero ? `<div class="hero">${visual(hero)}</div>` : `<div class="hero-art"><div class="arch"></div><div class="garland l">${corner}</div><div class="garland r">${corner}</div><p>Where every detail creates a beautiful memory</p></div>`}
      ${meta.customerName ? `<div class="plaque"><span>Prepared for</span><strong>${esc(meta.customerName)}</strong></div>` : ''}
    </div>
    <div class="facts">
      <div>${icon('calendar')}<span>Event date</span><strong>${longDate(e.date)}</strong></div>
      <div>${icon('pin')}<span>Location</span><strong>${esc([e.venueName, e.city].filter(Boolean).join(', ') || 'To be confirmed')}</strong></div>
      <div>${icon('people')}<span>Approximate guests</span><strong>${e.guestCount ? `${esc(e.guestCount)} guests` : 'To be confirmed'}</strong></div>
    </div>
    ${s.budget ? `<div class="package"><span>${s.kind === 'FINAL' ? 'Approved package value' : 'Package value'}</span><strong>${inr(s.budget.packageTotal)}</strong></div>` : ''}
    ${pill ? `<p class="pill">${esc(pill)}</p>` : ''}
    <div class="services-strip">${orderedServices(s).map((x) => `<span>${icon('star')}${esc(x.label)}</span>`).join('')}</div>
    <p class="ref">Proposal ${esc(meta.proposalNumber)} · Version ${esc(meta.version)}</p>
  </section>`;
}

const APPROACH = [
  ['Understand your vision', 'We listen to your ideas, preferences and budget expectations.'],
  ['Plan & confirm', 'Each service is matched to verified vendors and confirmed in writing.'],
  ['Coordinate', 'One STARVNT team aligns every vendor, timeline and detail.'],
  ['Execute', 'On the day, we manage every detail so you can enjoy the celebration.'],
];

function overview(s) {
  const e = s.event;
  const rows = [
    ['star', 'Event type', e.typeLabel], ['calendar', 'Event date', longDate(e.date)], ['people', 'Guest count', e.guestCount ? `Approximately ${e.guestCount} guests` : 'To be confirmed'],
    ['pin', 'Location', [e.venueName, e.address, e.city].filter(Boolean).join(', ') || 'To be confirmed'],
    ...(e.theme ? [['star', 'Theme', e.theme]] : []),
    ['star', 'Services included', orderedServices(s).map((x) => x.label).join(', ') || '—'],
    ...(s.customerProvided?.length ? [['check', 'Arranged by you', s.customerProvided.map((x) => x.label).join(', ')]] : []),
    ...(s.budget ? [['rupee', 'Package value', inr(s.budget.packageTotal)]] : []),
  ];
  return `<section class="page">
    ${sectionHeader('Event Overview & Planning Approach', 'A coordinated plan built around your requirements')}
    ${banner('Event details', 'calendar')}
    <table class="details">${rows.map(([ic, k, v]) => `<tr><th>${icon(ic)}<span>${esc(k)}</span></th><td>${esc(v)}</td></tr>`).join('')}</table>
    ${e.specialRequirements ? `<div class="note"><strong>Your special requirements</strong><p>${esc(e.specialRequirements)}</p></div>` : ''}
    ${banner('Our planning approach', 'star')}
    <ol class="approach">${APPROACH.map(([h, p]) => `<li><span class="num-badge"></span><strong>${esc(h)}</strong><p>${esc(p)}</p></li>`).join('')}</ol>
    ${importantNote(s.kind === 'FINAL' ? 'Every service, amount and term in this proposal comes from approved vendor agreements and STARVNT’s approved commercial record.' : 'This is a preliminary concept. Prices, vendors and scope may change until every approval is complete.')}
  </section>`;
}

function serviceSection(svc, s) {
  const [title, subtitle] = SECTION_TITLES[svc.category] || [svc.label, 'Included in your plan'];
  const visuals = (s.visuals?.[svc.category] || []).slice(0, 4);
  const prefs = Object.entries(svc.preferences || {}).filter(([, v]) => v !== '' && v != null);
  const isInventory = svc.items.some((i) => Number(i.quantity) > 1);
  const hasNotes = svc.items.some((i) => i.notes);
  return `<section class="block service" data-category="${esc(svc.category)}">
    ${sectionHeader(title, subtitle)}
    ${svc.summary ? `<p class="lead">${esc(svc.summary)}</p>` : ''}
    ${visuals.length ? `<div class="gallery g${visuals.length}">${visuals.map(visual).join('')}</div>` : ''}
    ${svc.items.length ? (isInventory
      ? `${banner(`${svc.label} inventory`, 'note')}<table class="inventory"><thead><tr><th>Item</th><th class="num">Quantity</th>${hasNotes ? '<th>Details</th>' : ''}</tr></thead><tbody>${svc.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${esc(i.quantity)}${i.unit ? ` ${esc(i.unit)}` : ''}</td>${hasNotes ? `<td>${esc(i.notes)}</td>` : ''}</tr>`).join('')}</tbody></table>`
      : `${banner(`${svc.label} selection`, 'star')}<ul class="tiles">${svc.items.map((i) => `<li><strong>${esc(i.name)}</strong>${i.notes ? `<span>${esc(i.notes)}</span>` : ''}</li>`).join('')}</ul>`) : ''}
    ${prefs.length ? `<dl class="prefs">${prefs.map(([k, v]) => `<div><dt>${esc(humanize(k))}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd></div>`).join('')}</dl>` : ''}
    ${svc.deliverables.length ? `${banner('Deliverables', 'check')}<ul class="checks">${svc.deliverables.map((d) => `<li>${icon('check')}<span>${esc(d)}</span></li>`).join('')}</ul>` : ''}
    ${svc.exclusions.length ? `<p class="excl"><strong>Not included:</strong> ${svc.exclusions.map(esc).join('; ')}</p>` : ''}
    ${svc.confirmed ? '' : '<p class="pending-badge">Vendor confirmation pending</p>'}
  </section>`;
}

function budgetSection(s) {
  const b = s.budget;
  return `<section class="block">
    ${sectionHeader('Budget & Scope Allocation', 'Every amount below comes from your approved commercial record')}
    <div class="glance"><span>Package value at a glance</span><strong>${inr(b.packageTotal)}</strong>${s.customerProvided?.length ? `<em>${esc(s.customerProvided.map((x) => x.label).join(', '))} arranged by you</em>` : ''}</div>
    <table class="budget"><thead><tr><th>Workstream</th><th class="num">Allocation</th><th>Included scope / deliverables</th></tr></thead><tbody>
      ${b.allocations.map((a, i) => `<tr><td><strong>${i + 1}. ${esc(a.label)}</strong>${a.quantity ? `<div class="muted">${esc(a.quantity)}</div>` : ''}</td><td class="num">${inr(a.amount)}</td><td>${esc(a.scopeSummary)}${a.deliverables.length ? `<div class="muted">${a.deliverables.map(esc).join('; ')}</div>` : ''}</td></tr>`).join('')}
      ${b.unallocated.amount ? `<tr><td><strong>Other</strong></td><td class="num">${inr(b.unallocated.amount)}</td><td>${esc(b.unallocated.explanation)}</td></tr>` : ''}
    </tbody><tfoot><tr><td>Total package value${b.taxes.included ? ' (taxes included)' : ''}</td><td class="num">${inr(b.packageTotal)}</td><td></td></tr></tfoot></table>
    ${b.taxes.note ? `<p class="muted">${esc(b.taxes.note)}</p>` : ''}
  </section>`;
}

function termsSection(s) {
  const b = s.budget, t = s.terms || {};
  const termRows = [['Cancellation', t.cancellation], ['Postponement', t.postponement], ['Scope changes', t.scopeChange]].filter(([, v]) => v);
  return `<section class="block">
    ${sectionHeader('Commercial Terms, Payment & Exclusions', 'Transparent terms for a smooth and successful celebration')}
    ${b ? `<div class="total-band">${icon('rupee', 'ic big')}<span>Total package value</span><strong>${inr(b.packageTotal)}</strong></div>` : ''}
    ${b?.paymentSchedule?.length ? `${banner('Payment schedule', 'calendar')}<table class="schedule"><thead><tr><th>Payment stage</th><th class="num">Payment %</th><th class="num">Amount</th><th>When</th></tr></thead><tbody>
      ${b.paymentSchedule.map((p, i) => `<tr><td><span class="step">${i + 1}</span>${esc(p.label)}</td><td class="num">${esc(p.percent)}%</td><td class="num amt">${inr(p.amount)}</td><td>${esc(p.dueRule)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="num">100%</td><td class="num">${inr(b.packageTotal)}</td><td></td></tr></tfoot></table>` : ''}
    ${termRows.length || t.customerResponsibilities?.length ? `${banner('Commercial terms & conditions', 'note')}<table class="terms">${termRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}${t.customerResponsibilities?.length ? `<tr><th>Your responsibilities</th><td>${t.customerResponsibilities.map(esc).join('; ')}</td></tr>` : ''}</table>` : ''}
    ${s.exclusions?.length ? `${banner('Exclusions', 'ban')}<p class="excl-intro">The following are excluded unless specifically included through a written amendment:</p><ul class="excl-grid">${s.exclusions.map((x) => `<li>${icon('ban')}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
    ${s.notes?.length ? `<div class="note">${s.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
  </section>`;
}

function checklistSection(s) {
  const confirmed = orderedServices(s).filter((x) => x.confirmed);
  const pending = [...s.pending.map((p) => p.item), ...orderedServices(s).filter((x) => !x.confirmed).map((x) => `${x.label}: vendor confirmation`)];
  return `<section class="block">
    ${sectionHeader('Finalization Checklist & Next Steps', 'What is confirmed, and what still needs your decision')}
    <div class="two-col">
      <div>${banner('Confirmed', 'check')}<ul class="checks">${confirmed.map((x) => `<li>${icon('check')}<span>${esc(x.label)}</span></li>`).join('') || '<li class="muted">None yet</li>'}</ul></div>
      <div>${banner('Pending confirmation', 'calendar')}<ul class="pending">${pending.map((p) => `<li><span class="dot"></span><span>${esc(p)}</span></li>`).join('') || '<li class="muted">Nothing pending</li>'}</ul></div>
    </div>
    ${banner('Next steps', 'star')}
    <ol class="steps">
      <li>Review this proposal and ask Aura+ anything about it.</li>
      <li>Request changes, or approve this exact version from your dashboard.</li>
      <li>Approving the proposal does not confirm a booking. Booking is confirmed only after the booking payment is verified.</li>
    </ol>
    <div class="thanks"><strong>Thank you for considering STARVNT Entertainment</strong><p>Our objective is to deliver a coordinated celebration with clear scope, transparent communication and responsible execution.</p></div>
  </section>`;
}

function theme(name) { return THEMES[name] || THEMES['royal-luxury']; }
const deepOf = (t) => `color-mix(in srgb, ${t.primary} 72%, black)`;

function css(name) {
  const t = theme(name);
  return `
  @page { size: A4; margin: 34mm 0 13mm 0; }
  :root { --primary:${t.primary}; --deep:${deepOf(t)}; --accent:${t.accent}; --gold-soft:color-mix(in srgb, ${t.accent} 35%, white); --paper:${t.paper}; --cream:color-mix(in srgb, ${t.paper} 82%, ${t.accent}); --ink:${t.ink}; --muted:${t.muted}; --line:${t.line}; }
  * { box-sizing: border-box; }
  html, body { margin:0; background: var(--paper); color: var(--ink); font: 10.5pt/1.5 Georgia, 'Times New Roman', serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 0 15mm; }
  h1, h2, h3 { font-family: 'Book Antiqua', 'Palatino Linotype', Palatino, Georgia, serif; margin: 0; font-weight: 700; }
  .frame { position: fixed; top: 0; bottom: 0; left: 0; right: 0; border-left: 4.5mm solid var(--deep); border-right: 4.5mm solid var(--deep); z-index: 0; pointer-events: none; }
  .frame::before { content: ''; position: absolute; top: 0; bottom: 0; left: 1.6mm; right: 1.6mm; border-left: .9pt solid var(--accent); border-right: .9pt solid var(--accent); }
  .corner { position: fixed; width: 30mm; height: 30mm; z-index: 1; pointer-events: none; }
  .corner svg { width: 100%; height: 100%; display: block; }
  .corner.tl { top: 0; left: 0; } .corner.tr { top: 0; right: 0; transform: scaleX(-1); } .corner.bl { bottom: 0; left: 0; transform: scaleY(-1); } .corner.br { bottom: 0; right: 0; transform: scale(-1,-1); }
  .page { break-after: page; position: relative; z-index: 2; }
  .block { margin-bottom: 10mm; position: relative; z-index: 2; }
  .block + .block, .page + .block { break-before: page; }
  .section-head { text-align: center; margin: 3mm 0 5mm; }
  .section-head h2 { font-size: 25pt; line-height: 1.08; text-transform: uppercase; letter-spacing: .4px; }
  .t1 { display: block; color: var(--primary); } .t2 { display: block; color: var(--accent); }
  .subtitle { margin: 2mm 0 0; color: var(--ink); font-style: italic; font-size: 11pt; } .orn { color: var(--accent); font-style: normal; }
  .ic { width: 4.6mm; height: 4.6mm; flex: none; vertical-align: -1mm; }
  .banner { display: flex; align-items: center; gap: 2.5mm; background: linear-gradient(90deg, var(--deep), var(--primary) 70%, var(--deep)); color: #fff; border: .9pt solid var(--accent); box-shadow: inset 0 0 0 1.2pt var(--deep), inset 0 0 0 1.8pt var(--accent); padding: 2.2mm 4mm; margin: 6mm 0 3mm; font: 700 11.5pt 'Book Antiqua', Georgia, serif; letter-spacing: .8px; text-transform: uppercase; break-after: avoid; }
  .banner .ic { color: var(--gold-soft); }
  .muted { color: var(--muted); font-size: 9pt; }
  .lead { font-size: 11.5pt; text-align: center; font-style: italic; margin: 0 0 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; background: #fffdf8; border: .9pt solid var(--accent); }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { text-align: left; padding: 2.3mm 3mm; border-bottom: .6pt solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
  thead th { background: var(--primary); color: #fff; font-weight: 700; font-family: 'Book Antiqua', Georgia, serif; letter-spacing: .3px; }
  tbody tr:nth-child(even) td { background: var(--cream); }
  tfoot td { font-weight: 700; background: var(--deep); color: var(--gold-soft); font-size: 10.5pt; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.details th, table.terms th { width: 36%; background: var(--primary); color: #fff; font-weight: 600; border-bottom: .6pt solid var(--deep); }
  table.details th .ic { color: var(--gold-soft); margin-right: 2mm; }
  .cover { min-height: 246mm; background: radial-gradient(ellipse at 50% 18%, var(--primary), var(--deep) 75%); margin: 0 -10.5mm; padding: 4mm 10mm 6mm; text-align: center; color: #fff; border: 1pt solid var(--accent); }
  .cover-panel { background: var(--paper); color: var(--ink); border: 1.4pt solid var(--accent); box-shadow: inset 0 0 0 1.6mm var(--paper), inset 0 0 0 2pt var(--accent); padding: 7mm 8mm 6mm; }
  .cover h1 { font-size: 32pt; line-height: 1.05; text-transform: uppercase; letter-spacing: .5px; }
  .tagline { font-style: italic; margin: 2.5mm 0 4mm; font-size: 12pt; }
  .hero img { width: 100%; height: 82mm; object-fit: cover; border: 1.4pt solid var(--accent); display: block; }
  .hero-art { height: 58mm; position: relative; background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--accent) 45%, white), var(--cream) 45%, var(--paper) 80%); border: 1pt solid var(--line); display: flex; align-items: flex-end; justify-content: center; overflow: hidden; }
  .arch { position: absolute; left: 22%; right: 22%; bottom: -12mm; top: 8mm; border: 2.4mm double var(--accent); border-bottom: 0; border-radius: 50% 50% 0 0 / 38% 38% 0 0; }
  .garland { position: absolute; top: 0; width: 34mm; height: 34mm; } .garland svg { width: 100%; height: 100%; } .garland.l { left: 0; } .garland.r { right: 0; transform: scaleX(-1); }
  .hero-art p { position: relative; margin: 0 0 5mm; font: italic 13pt 'Book Antiqua', Georgia, serif; color: var(--primary); }
  .plaque { display: inline-block; margin-top: 5mm; padding: 2.5mm 14mm; border: 1pt solid var(--accent); border-radius: 8mm; background: #fffdf8; }
  .plaque span { display: block; font: 600 8.5pt Arial, sans-serif; letter-spacing: 1.4px; text-transform: uppercase; color: var(--primary); }
  .plaque strong { font: 700 18pt 'Book Antiqua', Georgia, serif; color: var(--primary); }
  .facts { display: flex; margin: 6mm 0 5mm; background: color-mix(in srgb, #14182b 70%, var(--deep)); border: .9pt solid var(--accent); }
  .facts div { flex: 1; padding: 3.5mm 2mm; border-right: .6pt solid var(--accent); overflow-wrap: anywhere; }
  .facts div:last-child { border-right: 0; }
  .facts .ic { width: 7mm; height: 7mm; color: var(--accent); display: block; margin: 0 auto 1mm; }
  .facts span { display: block; font: 700 9pt 'Book Antiqua', Georgia, serif; letter-spacing: .8px; text-transform: uppercase; color: var(--accent); }
  .facts strong { font: 700 12pt 'Book Antiqua', Georgia, serif; color: #fff; }
  .package { margin: 0 auto 3mm; width: 74%; padding: 3.5mm; background: var(--primary); border: 1.4pt solid var(--accent); box-shadow: inset 0 0 0 1.4mm var(--primary), inset 0 0 0 1.8pt var(--accent); }
  .package span { display: block; font: 700 11pt 'Book Antiqua', Georgia, serif; letter-spacing: 1px; text-transform: uppercase; color: var(--gold-soft); }
  .package strong { font: 700 30pt/1.1 'Book Antiqua', Georgia, serif; color: #fff; }
  .pill { display: inline-block; margin: 0 0 4mm; background: var(--paper); color: var(--primary); border: .9pt solid var(--accent); border-radius: 6mm; padding: 1mm 6mm; font: 700 9.5pt Georgia, serif; }
  .services-strip { display: flex; flex-wrap: wrap; justify-content: center; margin: 2mm auto 0; row-gap: 2mm; }
  .services-strip span { font: 600 8pt Arial, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #fff; padding: 0 4mm; border-right: .6pt solid var(--accent); display: inline-flex; align-items: center; gap: 1.5mm; }
  .services-strip span:last-child { border-right: 0; } .services-strip .ic { color: var(--accent); width: 4mm; height: 4mm; }
  .ref { color: var(--gold-soft); font-size: 8.5pt; margin-top: 4mm; }
  .approach { list-style: none; counter-reset: step; display: grid; grid-template-columns: repeat(4, 1fr); padding: 0; margin: 0; border: .9pt solid var(--accent); background: #fffdf8; }
  .approach li { counter-increment: step; text-align: center; padding: 4mm 3mm; border-right: .6pt solid var(--line); }
  .approach li:last-child { border-right: 0; }
  .num-badge::before { content: counter(step); display: inline-grid; place-items: center; width: 8mm; height: 8mm; border-radius: 50%; background: var(--primary); color: var(--gold-soft); font: 700 11pt Georgia, serif; border: .9pt solid var(--accent); }
  .approach strong { display: block; margin: 2mm 0 1mm; color: var(--primary); text-transform: uppercase; font-size: 9pt; letter-spacing: .4px; }
  .approach p { margin: 0; font-size: 9pt; }
  .imp { display: flex; margin-top: 7mm; border: .9pt solid var(--accent); background: #fffdf8; break-inside: avoid; }
  .imp-label { flex: none; width: 46mm; display: flex; align-items: center; gap: 2.5mm; padding: 3mm 4mm; background: var(--primary); color: #fff; font: 700 11pt 'Book Antiqua', Georgia, serif; text-transform: uppercase; letter-spacing: .6px; }
  .imp-label .ic { width: 8mm; height: 8mm; color: var(--gold-soft); }
  .imp p { margin: 0; padding: 3mm 4mm; font-size: 9.5pt; align-self: center; }
  .note { border-left: 2.4pt solid var(--accent); background: var(--cream); padding: 3mm 4mm; margin: 4mm 0; }
  .tiles { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .tiles li { background: #fffdf8; border: .9pt solid var(--accent); border-radius: 2mm; padding: 3mm; text-align: center; box-shadow: inset 0 -1.2mm 0 var(--cream); break-inside: avoid; }
  .tiles strong { display: block; font: 700 10.5pt 'Book Antiqua', Georgia, serif; }
  .tiles span { display: block; font-size: 8.5pt; color: var(--muted); }
  .gallery { display: grid; gap: 3mm; margin: 2mm 0 4mm; } .gallery.g2, .gallery.g4 { grid-template-columns: 1fr 1fr; } .gallery.g3 { grid-template-columns: 1fr 1fr 1fr; }
  .visual { margin: 0; break-inside: avoid; background: #fffdf8; border: 1pt solid var(--accent); padding: 1.5mm; }
  .visual img { width: 100%; height: 56mm; object-fit: cover; display: block; }
  .visual figcaption { font: 7.5pt Arial, sans-serif; color: var(--muted); margin-top: 1.2mm; text-align: center; }
  .source { border: .5pt solid var(--accent); border-radius: 1mm; padding: .3mm 1.5mm; color: var(--primary); font-weight: 600; }
  .prefs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin: 4mm 0 0; }
  .prefs div { border: .6pt solid var(--line); background: var(--cream); padding: 2mm 3mm; }
  .prefs dt { font: 700 8pt Arial, sans-serif; color: var(--primary); text-transform: uppercase; letter-spacing: .5px; } .prefs dd { margin: 0; }
  .checks, .pending { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 6mm; }
  .checks li, .pending li { display: flex; gap: 2mm; align-items: flex-start; }
  .checks .ic { color: var(--primary); background: var(--gold-soft); border-radius: 50%; padding: .6mm; width: 5mm; height: 5mm; }
  .dot { flex: none; width: 3mm; height: 3mm; margin-top: 1.2mm; border-radius: 50%; border: 1.2pt solid var(--primary); }
  .pending-badge { display: inline-block; border: .8pt solid var(--primary); color: var(--primary); padding: 1mm 3mm; border-radius: 1mm; font: 600 8.5pt Arial, sans-serif; }
  .excl { font-size: 9.5pt; color: var(--muted); margin-top: 3mm; }
  .glance { display: flex; align-items: baseline; gap: 4mm; flex-wrap: wrap; border: .9pt solid var(--accent); background: var(--cream); padding: 3mm 4mm; margin-bottom: 4mm; }
  .glance span { font: 700 10pt 'Book Antiqua', Georgia, serif; color: var(--primary); text-transform: uppercase; letter-spacing: .6px; }
  .glance strong { font: 700 18pt Georgia, serif; color: var(--primary); } .glance em { font-size: 9pt; color: var(--muted); }
  table.budget td:first-child { width: 30%; } table.budget tbody td:nth-child(2) { width: 17%; color: var(--primary); font-weight: 700; }
  .total-band { display: flex; align-items: center; gap: 5mm; justify-content: center; background: linear-gradient(90deg, var(--deep), var(--primary), var(--deep)); border: 1.4pt solid var(--accent); box-shadow: inset 0 0 0 1.4mm var(--deep), inset 0 0 0 1.8pt var(--accent); padding: 4mm; color: #fff; }
  .total-band .big { width: 12mm; height: 12mm; color: var(--accent); }
  .total-band span { font: 700 13pt 'Book Antiqua', Georgia, serif; letter-spacing: 2px; text-transform: uppercase; color: var(--gold-soft); }
  .total-band strong { font: 700 28pt 'Book Antiqua', Georgia, serif; color: #fff; }
  .schedule .amt { color: var(--primary); font-weight: 700; font-size: 11pt; }
  .step { display: inline-grid; place-items: center; width: 5.5mm; height: 5.5mm; border-radius: 50%; background: var(--primary); color: #fff; font-size: 8pt; margin-right: 2.5mm; }
  .excl-intro { text-align: center; color: var(--primary); font-weight: 700; margin: 0 0 2mm; font-size: 9.5pt; }
  .excl-grid { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; border: .9pt solid var(--accent); background: #fffdf8; }
  .excl-grid li { display: flex; gap: 3mm; align-items: center; padding: 2.4mm 4mm; border-bottom: .6pt solid var(--line); }
  .excl-grid .ic { color: var(--primary); width: 5.5mm; height: 5.5mm; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .two-col .checks, .two-col .pending { grid-template-columns: 1fr; padding: 0 2mm; }
  .steps { margin: 0; padding-left: 6mm; } .steps li { margin-bottom: 1.5mm; }
  .thanks { margin-top: 8mm; text-align: center; border-top: .9pt solid var(--accent); padding-top: 4mm; }
  .thanks strong { font: 700 14pt 'Book Antiqua', Georgia, serif; color: var(--primary); text-transform: uppercase; letter-spacing: .6px; }
  .thanks p { margin: 1.5mm 0 0; font-style: italic; }
  .watermark { position: fixed; top: 45%; left: -10%; width: 120%; text-align: center; transform: rotate(-30deg); font: 700 22pt Arial, sans-serif; color: rgba(140, 20, 30, .14); letter-spacing: 2px; z-index: 5; pointer-events: none; }
  .prelim-banner { background: #8C141E; color: #fff; text-align: center; font: 700 9.5pt Arial, sans-serif; padding: 2mm; margin-bottom: 6mm; letter-spacing: .6px; position: relative; z-index: 2; }
  `;
}

/**
 * @param snapshot customer-safe snapshot
 * @param meta { proposalNumber, version, theme, customerName }
 */
export function composeProposalHtml(snapshot, meta = {}) {
  const preliminary = snapshot.kind !== 'FINAL';
  const services = orderedServices(snapshot);
  const corner = cornerSvg(theme(meta.theme));
  const body = [
    cover(snapshot, meta),
    preliminary ? `<div class="prelim-banner">${PRELIMINARY_WATERMARK}</div>` : '',
    overview(snapshot),
    ...services.map((svc) => serviceSection(svc, snapshot)),
    snapshot.budget ? budgetSection(snapshot) : '',
    snapshot.budget || snapshot.terms ? termsSection(snapshot) : '',
    checklistSection(snapshot),
  ].join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(meta.proposalNumber || 'STARVNT Proposal')}</title><style>${css(meta.theme)}</style></head>
<body><div class="frame"></div>${['tl', 'tr', 'bl', 'br'].map((c) => `<div class="corner ${c}">${corner}</div>`).join('')}${preliminary ? `<div class="watermark">${PRELIMINARY_WATERMARK}</div>` : ''}${body}</body></html>`;
}

/** Running header (crest band) for Puppeteer; repeats on every page. */
export function headerTemplate(meta = {}) {
  const t = theme(meta.theme);
  return `<style>#header,#footer{padding:0 !important;margin:0 !important;}</style><div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;width:100%;height:34mm;margin:0;position:relative;font-family:'Book Antiqua',Georgia,serif;background:${deepOf(t)};">
    <div style="position:absolute;left:1.6mm;right:1.6mm;top:2.5mm;bottom:0;border:.9pt solid ${t.accent};border-bottom:0;"></div>
    <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:96mm;height:28mm;background:${t.primary};border:1.4pt solid ${t.accent};border-top:0;border-radius:0 0 7mm 7mm;text-align:center;">
      <div style="padding-top:4.6mm;font-size:24px;font-weight:700;letter-spacing:5px;color:${t.accent};line-height:1;">STARVNT</div>
      <div style="font-size:11px;letter-spacing:4px;color:#f3e6cf;margin-top:1.2mm;">ENTERTAINMENT</div>
      <div style="font-size:8px;font-style:italic;color:#f3e6cf;margin-top:1.4mm;">You enjoy the occasion, we handle the arrangements.</div>
    </div></div>`;
}

/** Running footer band; page numbers are real PDF text. */
export function footerTemplate(meta = {}, preliminary = false) {
  const t = theme(meta.theme);
  return `<style>#header,#footer{padding:0 !important;margin:0 !important;}</style><div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;width:100%;height:13mm;margin:0;background:${deepOf(t)};display:flex;align-items:center;justify-content:space-between;padding:0 16mm;box-sizing:border-box;font:9px Georgia,serif;letter-spacing:1px;color:${t.accent};">
    <span>STARVNT ENTERTAINMENT · Proposal ${esc(meta.proposalNumber)} · v${esc(meta.version)}${preliminary ? ` · ${PRELIMINARY_WATERMARK}` : ''}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}
