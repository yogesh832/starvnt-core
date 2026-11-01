import PDFDocument from 'pdfkit';
import { sourceLabel } from './policy.js';
import { badRequest } from '../customer/utils/http.js';
import { proposalPalette } from '../../../shared/proposalContent.js';

async function imageBytes(asset) {
  const response = await fetch(asset.url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!response.ok || !/^image\/(png|jpeg)(;|$)/i.test(response.headers.get('content-type') || '')) throw badRequest('IMAGE_UNAVAILABLE', `Replace the unavailable image: ${asset.caption}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1024 * 1024) throw badRequest('IMAGE_TOO_LARGE', 'Optimize each proposal image to less than 1 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function renderProposal(s, version, loadImage = imageBytes) {
  const images = [];
  // Bound provider/CDN concurrency, including when rich proposals contain many images.
  for (let start = 0; start < s.assets.length; start += 4) images.push(...await Promise.all(s.assets.slice(start, start + 4).map(loadImage)));
  const doc = new PDFDocument({ size: 'A4', margins: { top: 100, bottom: 66, left: 43, right: 43 }, bufferPages: true, autoFirstPage: false, info: { Title: `${s.event.title} - STARVNT Proposal v${version.number}`, Author: 'STARVNT', Subject: 'Approved event proposal' } });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const p = proposalPalette(s.theme), W = 509.28, L = 43, B = 770;
  const safe = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[—–]/g, '-').replace(/₹/g, 'INR ');
  const cash = n => `INR ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  function flower(x, y) {
    doc.save();
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; doc.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 4, 7).fill(j % 2 ? p.primary : p.accent); }
    doc.circle(x, y, 3).fill(p.accent); doc.restore();
  }
  function frame() {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(p.paper);
    doc.rect(12, 12, doc.page.width - 24, doc.page.height - 24).lineWidth(2).strokeColor(p.primary).stroke();
    doc.rect(17, 17, doc.page.width - 34, doc.page.height - 34).lineWidth(.6).strokeColor(p.accent).stroke();
    doc.rect(23, 23, doc.page.width - 46, 47).fill(p.primary);
    doc.fillColor(p.paper).font('Times-Bold').fontSize(18).text('STARVNT ENTERTAINMENT', L, 34, { width: W, align: 'center', lineBreak: false });
    doc.font('Times-Italic').fontSize(8).text('Where your story becomes a celebration.', L, 55, { width: W, align: 'center', lineBreak: false });
    if (p.ornate) { flower(25, 79); flower(doc.page.width - 25, 79); flower(25, doc.page.height - 34); flower(doc.page.width - 25, doc.page.height - 34); }
    doc.y = 94; doc.x = L;
  }
  function page(title, kicker = 'THE APPROVED EVENT EXPERIENCE') {
    doc.addPage(); frame();
    doc.fillColor(p.accent).font('Helvetica-Bold').fontSize(8).text(kicker, L, doc.y, { width: W, align: 'center', characterSpacing: 1.3 });
    doc.moveDown(.8);
    doc.fillColor(p.primary).font('Times-Bold').fontSize(25).text(safe(title), L, doc.y, { width: W, align: 'center', lineGap: 3 });
    doc.moveDown(.6);
  }
  function continuation() { doc.addPage(); frame(); }
  function room(h) { if (doc.y + h > B) continuation(); }
  function body(t, size = 10) {
    if (!t) return;
    doc.font('Helvetica').fontSize(size).fillColor('#30292A');
    const text = safe(t);
    for (const paragraph of text.split('\n')) {
      // Text may span any number of pages; long approved content is never clipped.
      const lines = wrap(paragraph, W, size);
      for (const line of lines) { room(size * 1.55); doc.font('Helvetica').fontSize(size).fillColor('#30292A').text(line || ' ', L, doc.y, { width: W, lineBreak: false }); doc.y += size * 1.55; }
      doc.y += 4;
    }
    doc.y += 6;
  }
  function heading(t) { room(48); doc.font('Times-Bold').fontSize(17).fillColor(p.primary).text(safe(t), L, doc.y, { width: W }); doc.y += 8; }
  function wrap(value, width, size = 9) {
    doc.font('Helvetica').fontSize(size);
    const out = []; let line = '';
    for (const word of safe(value).split(/\s+/)) {
      if (doc.widthOfString(`${line} ${word}`.trim()) <= width) { line = `${line} ${word}`.trim(); continue; }
      if (line) out.push(line); line = '';
      let part = '';
      for (const c of word) { if (doc.widthOfString(part + c) > width && part) { out.push(part); part = ''; } part += c; }
      line = part;
    }
    if (line || !out.length) out.push(line);
    return out;
  }
  function table(headers, rows, widths) {
    const header = () => {
      room(32); const y = doc.y;
      let x = L; doc.rect(L, y, W, 28).fill(p.primary);
      headers.forEach((h, i) => { doc.font('Helvetica-Bold').fontSize(8).fillColor(p.paper).text(safe(h), x + 6, y + 7, { width: widths[i] - 12, height: 21 }); x += widths[i]; });
      doc.y = y + 28;
    };
    header();
    rows.forEach((row, ri) => {
      const cells = row.map((t, i) => wrap(t, widths[i] - 12));
      let offset = 0; const total = Math.max(...cells.map(c => c.length));
      while (offset < total) {
        if (B - doc.y < 38) { continuation(); header(); }
        const count = Math.min(total - offset, Math.max(1, Math.floor((B - doc.y - 12) / 12)));
        const h = count * 12 + 12, y = doc.y; let x = L;
        row.forEach((_, ci) => { doc.rect(x, y, widths[ci], h).fillAndStroke(ri % 2 ? '#F0E5CD' : '#FFFDF7', '#CFB88C'); doc.font('Helvetica').fontSize(9).fillColor('#30292A').text(cells[ci].slice(offset, offset + count).join('\n'), x + 6, y + 6, { width: widths[ci] - 12, height: h - 9, lineGap: 1 }); x += widths[ci]; });
        doc.y = y + h; offset += count;
      }
    }); doc.y += 18;
  }
  function picture(index, x, y, width, height) {
    if (!images[index]) throw badRequest('MISSING_IMAGE', 'A selected proposal image is unavailable.');
    const ref = doc.openImage(images[index]);
    if (ref.width > 8000 || ref.height > 8000 || ref.width * ref.height > 24e6) throw badRequest('IMAGE_DIMENSIONS_TOO_LARGE', 'Resize the visual assets before generating.');
    doc.rect(x, y, width, height).fill('#E9DDC7');
    doc.image(images[index], x, y, { fit: [width, height], align: 'center', valign: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor('#685E55').text(safe(`${sourceLabel[s.assets[index].source]} | ${s.assets[index].caption}`), x, y + height + 5, { width, height: 28 });
  }
  function grid(items, columns) {
    const gap = 10, width = (W - gap * (columns - 1)) / columns;
    for (let i = 0; i < items.length; i += columns) {
      const row = items.slice(i, i + columns), height = columns === 3 ? 165 : 205;
      room(height + 12); const y = doc.y;
      row.forEach((item, j) => {
        const x = L + j * (width + gap), imageH = height - 67;
        if (item.assetIndex !== null && item.assetIndex !== undefined) picture(item.assetIndex, x, y, width, imageH);
        else { doc.rect(x, y, width, imageH).fill('#EEE2CD'); doc.font('Times-Italic').fontSize(12).fillColor(p.primary).text('Approved scope', x + 10, y + imageH / 2 - 10, { width: width - 20, align: 'center' }); }
        doc.rect(x, y + imageH + 31, width, 35).fill(p.primary);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(p.paper).text(safe(item.name), x + 6, y + imageH + 35, { width: width - 12, height: 21, align: 'center' });
        doc.font('Helvetica').fontSize(7).text(`${item.status || 'ILLUSTRATIVE'}${item.choiceGroup ? ' / ' + safe(item.choiceGroup) : ''}`, x + 6, y + imageH + 55, { width: width - 12, height: 11, align: 'center' });
      }); doc.y = y + height + 16;
    }
  }
  try {
    page('');
    doc.rect(30, 84, doc.page.width - 60, 675).fill(p.dark);
    doc.fillColor(p.accent).font('Helvetica-Bold').fontSize(9).text(version.qa ? 'SYNTHETIC LAYOUT QA / NOT A CUSTOMER PROPOSAL' : 'PERSONALLY PLANNED / CORE APPROVED', L, 109, { width: W, align: 'center', characterSpacing: 1.3 });
    doc.fillColor(p.paper).font('Times-Bold').fontSize(30).text(safe(`${s.event.eventType.replaceAll('_', ' ').toUpperCase()} EVENT PROPOSAL`), L + 10, 138, { width: W - 20, height: 83, align: 'center' });
    picture(0, L, 231, W, 230);
    doc.rect(L, 461, W, 33).fill(p.paper);
    doc.font('Helvetica').fontSize(7).fillColor(p.primary).text(safe(`${sourceLabel[s.assets[0].source]} | ${s.assets[0].caption}`), L + 5, 466, { width: W - 10, height: 25 });
    doc.fillColor(p.paper).font('Times-Bold').fontSize(20).text(safe(s.event.title), L + 10, 506, { width: W - 20, height: 54, align: 'center' });
    doc.font('Helvetica').fontSize(10).text(safe(`${s.event.eventDate}  |  ${s.event.guestCount} guests\n${s.event.location?.venueName || ''}, ${s.event.city}`), L + 12, 566, { width: W - 24, height: 58, align: 'center', lineGap: 5 });
    doc.fillColor(p.accent).font('Times-Bold').fontSize(27).text(cash(s.total), L, 640, { width: W, align: 'center' });
    doc.fillColor(p.paper).font('Helvetica').fontSize(8).text(safe(`Version ${version.number} / Valid until ${version.expiresAt.slice(0, 10)}\n${s.venueResponsibility || 'Approved scope, exclusions and payment terms follow.'}`), L + 12, 694, { width: W - 24, height: 45, align: 'center', lineGap: 4 });
    page('Event overview & planning approach');
    table(['Event detail', 'Approved brief'], [['Event', s.event.title], ['Date and location', `${s.event.eventDate} / ${s.event.city}`], ['Venue', s.event.location?.venueName || ''], ['Venue responsibility', s.venueResponsibility || 'As recorded in the approved scope'], ['Guests', s.event.guestCount], ['Visual direction', `${s.theme}${s.paletteNotes ? ' / ' + s.paletteNotes : ''}`], ['Customer package', cash(s.total)]], [145, W - 145]);
    body(s.introduction); if (s.event.specialRequirements) { heading('Your priorities'); body(s.event.specialRequirements); }
    heading('The approved services'); body(s.allocations.map(a => `${a.category}: ${a.scope}`).join('\n'));
    const sections = s.sections || [];
    for (const allocation of s.allocations) {
      if (sections.some(section => section.category === allocation.category)) continue;
      page(allocation.category);
      const indexes = s.assets.map((a, i) => a.category === allocation.category ? i : -1).filter(i => i >= 0);
      if (indexes.length) grid(indexes.map(i => ({ name: s.assets[i].caption, assetIndex: i, status: sourceLabel[s.assets[i].source] })), 2);
      heading('Scope & experience'); body(allocation.scope); heading('Deliverables'); body(allocation.deliverables || 'As specified in the approved written scope.'); body(`Quantity: ${allocation.quantity} / Customer allocation: ${cash(allocation.amount)}`);
    }
    for (const section of sections) {
      page(section.title, section.category ? section.category.toUpperCase() : 'YOUR EVENT EXPERIENCE');
      body(section.description);
      if (['menu', 'design', 'equipment', 'deliverables', 'team'].includes(section.kind)) grid(section.items, section.kind === 'menu' || section.kind === 'equipment' ? 3 : 2);
      if (section.kind === 'layout') {
        room(340); const y = doc.y; doc.rect(L, y, W, 310).fillAndStroke('#F2E7D2', p.accent);
        section.items.forEach(item => { const x = L + item.x / 100 * W, top = y + item.y / 100 * 310, w = item.width / 100 * W, h = item.height / 100 * 310; doc.rect(x, top, w, h).lineWidth(1).fillAndStroke('#E1CA9F', p.primary); if (w > 35 && h > 16) doc.font('Helvetica').fontSize(7).fillColor(p.primary).text(safe(item.name), x + 3, top + 3, { width: w - 6, height: h - 6 }); });
        doc.y = y + 325; body('Illustrative planning layout; approved measurements and venue permissions govern execution.', 8);
      }
      table(['Item / selection', 'Quantity / unit', 'Approved details / conditions'], section.items.map(i => [i.name + (i.choiceGroup ? ` / ${i.choiceGroup}` : '') + `\n${i.status}`, `${i.quantity} ${i.unit}${i.capacity !== null ? ' / capacity per unit ' + i.capacity : ''}`, i.details || 'As shown in the approved service scope']), [150, 90, W - 240]);
      if (section.coverageNote) { heading('Coverage & limitations'); body(section.coverageNote); }
    }
    page('Package budget & scope allocation');
    table(['Workstream', 'Customer allocation', 'Included scope / deliverables'], s.allocations.map(a => [a.category, cash(a.amount), `${a.quantity} unit(s) / ${a.scope}\n${a.deliverables}`]), [115, 110, W - 225]);
    heading(`Total approved package: ${cash(s.total)}`);
    const structured = sections.length || s.checklist?.length || s.milestones?.length;
    if (structured) page('Commercial terms, payment & exclusions');
    if (s.milestones?.length) table(['Payment stage', 'Amount / share', 'Due condition'], s.milestones.map(m => [m.title, `${cash(m.amount)} / ${s.total ? (m.amount / s.total * 100).toFixed(2) : '0'}%`, m.due]), [145, 135, W - 280]);
    heading('Payment schedule'); body(s.paymentTerms); heading('Exclusions'); body(s.exclusions);
    page('Finalization checklist & next steps');
    if (s.checklist?.length) table(['Confirmation', 'Owner / status', 'Details'], s.checklist.map(c => [c.title, `${c.owner} / ${c.status}${c.mandatory ? ' / required' : ''}`, c.details]), [145, 130, W - 275]);
    else body('Vendor agreements: approved at generation.\nCommercial review: approved at generation.\nCustomer decision: review the current status in your dashboard.');
    heading('Execution roadmap'); body(s.roadmap || 'Coordinate the final event schedule through your STARVNT event workspace.');
    heading('Review, refine, approve'); body('Review this exact version in My Event Proposal. You can ask Aura+ questions, request changes, approve or decline. Proposal approval does not confirm a booking or verify a payment. Booking and payment remain governed by STARVNT Core.');
    body('AI concepts, planning layouts and reference images are illustrative. Approved written scope defines deliverables. Venue permissions and recorded safety conditions govern all special effects and structures.', 9);
    const range = doc.bufferedPageRange();
    if (range.count > 100) throw badRequest('TOO_MANY_PAGES', 'Reduce or split this proposal before final delivery.');
    for (let i = 0; i < range.count; i++) { doc.switchToPage(i); const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0; doc.font('Helvetica').fontSize(7).fillColor(p.primary).text(`STARVNT / v${version.number} / ${i + 1} of ${range.count}`, L, 800, { width: W, lineBreak: false, align: 'right' }); doc.page.margins.bottom = bottom; }
    doc.end();
  } catch (error) { doc.destroy(); throw error; }
  return complete;
}
