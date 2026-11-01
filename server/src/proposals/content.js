import { badRequest } from '../customer/utils/http.js';
import { SECTION_KINDS, ITEM_STATES, CHECK_STATES, CHECK_OWNERS } from '../../../shared/proposalContent.js';
const str = (v, max) => String(v ?? '').trim().slice(0, max);
function list(value, max, name) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw badRequest('INVALID_PROPOSAL_CONTENT', `${name} must contain at most ${max} valid entries.`);
  return value;
}
const number = (v, min, max, fallback = null) => v == null || v === '' ? fallback : typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : NaN;
export function cleanContent(input, assetCount) {
  const sections = list(input.sections, 20, 'Sections').map(s => {
    if (!SECTION_KINDS.includes(s.kind) || !str(s.title, 120)) throw badRequest('INVALID_SECTION', 'Each section needs a title and supported layout.');
    return { kind: s.kind, title: str(s.title, 120), category: str(s.category, 80), description: str(s.description, 1600), coverageNote: str(s.coverageNote, 1000), items: list(s.items, 40, 'Section items').map(i => {
      const item = { name: str(i.name, 120), details: str(i.details, 1200), quantity: number(i.quantity, .01, 100000, 1), unit: str(i.unit, 50), status: i.status || 'INCLUDED', choiceGroup: str(i.choiceGroup, 80), assetIndex: number(i.assetIndex, 0, assetCount - 1), capacity: number(i.capacity, 0, 100000), x: number(i.x, 0, 100, 0), y: number(i.y, 0, 100, 0), width: number(i.width, 1, 100, 20), height: number(i.height, 1, 100, 15) };
      if (!item.name || !ITEM_STATES.includes(item.status) || Object.values(item).some(v => typeof v === 'number' && !Number.isFinite(v)) || (item.assetIndex !== null && !Number.isInteger(item.assetIndex)) || (s.kind === 'layout' && (item.x + item.width > 100 || item.y + item.height > 100))) throw badRequest('INVALID_SECTION_ITEM', 'Check the item name, selection, image reference, quantities and layout dimensions.');
      return item;
    }) };
  });
  const checklist = list(input.checklist, 60, 'Checklist').map(c => {
    if (!str(c.title, 140) || !CHECK_STATES.includes(c.status || 'PENDING') || !CHECK_OWNERS.includes(c.owner || 'STARVNT')) throw badRequest('INVALID_CHECKLIST', 'Each confirmation needs a title, owner and valid status.');
    return { title: str(c.title, 140), category: str(c.category, 80), details: str(c.details, 1600), owner: c.owner || 'STARVNT', status: c.status || 'PENDING', mandatory: c.mandatory !== false, evidence: str(c.evidence, 1200) };
  });
  const milestones = list(input.milestones, 12, 'Payment milestones').map(m => {
    if (!str(m.title, 120) || !str(m.due, 300) || !Number.isFinite(m.amount) || m.amount < 0 || m.amount > 1e9 || Math.abs(m.amount * 100 - Math.round(m.amount * 100)) > .0001) throw badRequest('INVALID_MILESTONE', 'Each payment stage needs a title, due condition and valid customer amount.');
    return { title: str(m.title, 120), amount: m.amount, due: str(m.due, 300) };
  });
  const costReview = Object.fromEntries(['logistics', 'operations', 'contingency'].map(k => [k, number(input.costReview?.[k], 0, 1e9, 0)]));
  if (Object.values(costReview).some(v => !Number.isFinite(v))) throw badRequest('INVALID_INTERNAL_COST', 'Internal costs must be non-negative numbers.');
  return { sections, checklist, milestones, costReview, venueResponsibility: str(input.venueResponsibility, 700), paletteNotes: str(input.paletteNotes, 700) };
}
export function contentBlockers(draft, event) {
  const blockers = [];
  for (const s of draft.sections || []) {
    if (!s.items.length) blockers.push(`Add the approved content for ${s.title}.`);
    if (s.category && !draft.allocations.some(a => a.category === s.category)) blockers.push(`Link ${s.title} to an approved service allocation.`);
    const items = s.items.filter(i => i.status !== 'EXCLUDED');
    if (items.some(i => i.status === 'PENDING')) blockers.push(`Resolve pending items in ${s.title}.`);
    const groups = [...new Set(items.map(i => i.choiceGroup).filter(Boolean))];
    for (const group of groups) if (items.filter(i => i.choiceGroup === group && i.status === 'SELECTED').length !== 1) blockers.push(`Choose exactly one approved option for ${group} in ${s.title}.`);
    const seats = items.filter(i => ['INCLUDED', 'SELECTED'].includes(i.status) && i.capacity !== null).reduce((sum, i) => sum + i.quantity * i.capacity, 0);
    if (s.kind === 'inventory' && items.some(i => i.capacity !== null) && seats < event.guestCount && !s.coverageNote) blockers.push(`Explain seating or capacity coverage in ${s.title}.`);
  }
  for (const c of draft.checklist || []) if (c.mandatory && (c.status !== 'CONFIRMED' || !c.evidence)) blockers.push(`Confirm and record evidence for ${c.title}.`);
  if (draft.milestones?.length && draft.milestones.reduce((sum, m) => sum + Math.round(m.amount * 100), 0) !== Math.round(draft.total * 100)) blockers.push('Payment milestone amounts must reconcile with the approved customer total.');
  return blockers;
}
