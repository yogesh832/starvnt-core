import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

// Only approved customer-facing fields enter the document; procurement costs,
// vendor identities, commercial audit entries and authentication data stay out.
export function renderProposal(p, preliminary = false, visuals = []) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 65, bottom: 65, left: 55, right: 55 }, bufferPages: true, info: { Title: `${p.manifest.title} — Proposal v${p.version}`, Author: 'STARVNT' } });
    const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [name, file] of Object.entries({ Body: 'NotoSans-Regular', Bold: 'NotoSans-Bold', Hindi: 'NotoSansDevanagari-Regular', Bengali: 'NotoSansBengali-Regular' })) doc.registerFont(name, fileURLToPath(new URL(`../../assets/fonts/${file}.ttf`, import.meta.url)));
    const write = (value, bold = false) => {
      const runs = String(value || '').match(/([\p{Script=Devanagari}\u200c\u200d]+|[\p{Script=Bengali}]+|[^\p{Script=Devanagari}\p{Script=Bengali}\u200c\u200d]+)/gu) || [''];
      runs.forEach((run, i) => { const font = /\p{Script=Devanagari}/u.test(run) ? 'Hindi' : /\p{Script=Bengali}/u.test(run) ? 'Bengali' : bold ? 'Bold' : 'Body'; doc.font(font).text(run, { lineGap: 5, continued: i < runs.length - 1 }); });
    };
    const cash = n => `INR ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const paragraph = value => { doc.fontSize(11).fillColor('#30252a'); write(value); doc.moveDown(); };
    const heading = value => { if (doc.y > 690) doc.addPage(); doc.fontSize(20).fillColor('#641d37'); write(value, true); doc.moveDown(0.6); };
    doc.font('Bold').fontSize(13).fillColor('#641d37').text('STARVNT  /  EVENT PROPOSAL'); doc.moveDown(3);
    doc.fontSize(32); write(p.manifest.title, true); doc.moveDown();
    paragraph(`Prepared for ${p.manifest.customerName || 'our customer'}\nVersion ${p.version} | ${p.manifest.eventType}\n${p.manifest.eventDate} | ${p.manifest.city}\n${p.manifest.guestCount} guests`);
    if (preliminary) paragraph('PRELIMINARY - NOT A FINAL APPROVED PROPOSAL');
    paragraph('This proposal records the proposed scope and commercial terms. Customer approval does not itself confirm a booking or payment.');
    doc.addPage(); heading('Your event');
    paragraph([p.manifest.venue, p.manifest.address, p.manifest.notes].filter(Boolean).join('\n') || 'Venue details to be agreed.');
    if (p.manifest.specialRequirements) paragraph(p.manifest.specialRequirements);
    if (p.manifest.requirements?.length) { heading('Confirmed event brief'); for (const r of p.manifest.requirements) paragraph([r.category, r.providedValue, r.specialRequirements].filter(Boolean).join(' | ')); }
    for (const image of visuals) {
      doc.addPage(); heading(image.title); doc.image(image.bytes, 55, doc.y, { fit: [485, 480], align: 'center' }); doc.y += 495;
      paragraph(`Source: ${image.source.replaceAll('_', ' ')} | ${image.attribution}`);
      if (image.source === 'AI_CONCEPT') paragraph('AI-generated concept reference. This is not a photograph of delivered work or a guarantee of the final setup.');
      else paragraph('Visual reference only; agreed deliverables are specified in the service scope.');
    }
    heading('Service scope');
    for (const l of p.lines || []) { heading(l.name); paragraph(l.description); paragraph(`${l.quantity} x ${cash(l.customerUnitPrice)} = ${cash(Math.round(l.quantity * l.customerUnitPrice * 100) / 100)}`); }
    for (const s of p.sections || []) { doc.addPage(); heading(s.title); paragraph(s.body); }
    doc.addPage(); heading('Investment & payments');
    paragraph(`Tax / additional charges: ${cash(p.taxAmount || 0)}\nTotal: ${cash(p.totalAmount || 0)}`);
    for (const row of p.payments || []) paragraph(`${row.label} | ${row.due} | ${cash(row.amount)}`);
    heading('Terms'); paragraph(p.terms); if (p.exclusions) { heading('Exclusions'); paragraph(p.exclusions); }
    for (const x of p.excludedRequirements || []) { const r = p.manifest.requirements?.find(r => String(r._id) === String(x.requirement)); paragraph(`Excluded requirement: ${r?.category || 'Requirement'} | ${x.reason}`); }
    heading('Next steps'); paragraph('Review the scope, payment schedule and terms. Approve this exact version, decline, or request changes in your customer portal. Booking confirmation follows the separate booking and payment process.');
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i); const old = doc.y;
      doc.font('Helvetica').fontSize(8).fillColor('#715c65').text(`${preliminary ? 'PRELIMINARY | ' : ''}STARVNT | v${p.version} | ${i + 1} / ${range.count}`, 55, 35, { lineBreak: false });
      if (p.snapshotHash) doc.text(`Snapshot ${p.snapshotHash.slice(0, 24)}`, 55, 805, { lineBreak: false }); doc.y = old;
    }
    doc.end();
  });
}
