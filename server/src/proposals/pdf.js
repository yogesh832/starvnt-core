import PDFDocument from 'pdfkit';
import { sourceLabel } from './policy.js';
import { badRequest } from '../customer/utils/http.js';

async function imageBytes(asset) {
  const response = await fetch(asset.url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!response.ok || !/^image\/(png|jpeg)(;|$)/i.test(response.headers.get('content-type') || '')) throw badRequest('IMAGE_UNAVAILABLE', `Replace the unavailable image: ${asset.caption}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1024 * 1024) { await response.body.cancel().catch(() => {}); throw badRequest('IMAGE_TOO_LARGE', 'Optimize each proposal image to less than 1 MB.'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Asset loader is injectable only at the service/module boundary for isolated QA.
// API callers cannot supply buffers, file paths, or arbitrary download hosts.
export async function renderProposal(snapshot, version, loadImage = imageBytes) {
  const images = await Promise.all(snapshot.assets.map(loadImage));
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 68, left: 48, right: 48 }, bufferPages: true, info: { Title: `${snapshot.event.title} - STARVNT Proposal v${version.number}`, Author: 'STARVNT', Subject: 'Approved event proposal' } });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const wine = '#632A3B', gold = '#AC8B56', ink = '#292526', muted = '#706B68';
  const width = doc.page.width - 96;
  const safe = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[—–]/g, '-');
  function page(title, kicker = 'STARVNT / PROPOSAL STUDIO') {
    if (doc.y > 64) doc.addPage();
    doc.rect(0, 0, doc.page.width, 10).fill(wine);
    doc.font('Helvetica').fontSize(9).fillColor(gold).text(kicker, 48, 36, { characterSpacing: 1.8 });
    doc.font('Times-Roman').fontSize(29).fillColor(wine).text(safe(title), 48, 78, { width });
    doc.moveDown(.8);
  }
  function body(value, size = 11) {
    doc.font('Helvetica').fontSize(size).fillColor(ink).text(safe(value), 48, doc.y, { width, lineGap: 6 });
    doc.moveDown(.65);
  }
  function heading(value) {
    if (doc.y > 680) doc.addPage();
    doc.font('Times-Roman').fontSize(19).fillColor(wine).text(safe(value), 48, doc.y, { width });
    doc.moveDown(.5);
  }
  function image(index, height = 265) {
    if (doc.y + height + 70 > 760) doc.addPage();
    const y = doc.y;
    const ref = doc.openImage(images[index]);
    if (ref.width > 8000 || ref.height > 8000 || ref.width * ref.height > 24e6) throw badRequest('IMAGE_DIMENSIONS_TOO_LARGE', 'Resize the visual assets before generating.');
    doc.image(images[index], 48, y, { fit: [width, height], align: 'center', valign: 'center' });
    doc.y = y + height + 12;
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(`${sourceLabel[snapshot.assets[index].source]} | ${safe(snapshot.assets[index].caption)}`, 48, doc.y, { width, lineGap: 3 });
    doc.moveDown(1.4);
  }
  try {
    page('From your vision to a beautifully planned celebration.');
    image(0, 280);
    heading(snapshot.event.title || snapshot.event.eventType);
    body(`${snapshot.event.eventDate}  |  ${snapshot.event.location?.venueName || ''}, ${snapshot.event.city}\n${snapshot.event.guestCount} guests  |  ${snapshot.theme}`);
    body(`Proposal ${version.id} / Version ${version.number}\nIssued ${version.createdAt.slice(0, 10)} / Valid until ${version.expiresAt.slice(0, 10)}`, 9);
    page('Your event, thoughtfully composed');
    body(snapshot.introduction || `A personalized ${snapshot.event.eventType} experience shaped around your confirmed requirements and approved service scope.`);
    heading('The event brief');
    body(`${snapshot.event.eventType}\n${snapshot.event.eventDate}\n${snapshot.event.location?.venueName || ''}, ${snapshot.event.city}\n${snapshot.event.guestCount} guests\nTheme: ${snapshot.theme}`);
    if (snapshot.event.specialRequirements) { heading('Your priorities'); body(snapshot.event.specialRequirements); }
    for (const allocation of snapshot.allocations) {
      page(allocation.category, 'THE APPROVED EXPERIENCE');
      const indexes = snapshot.assets.map((a, i) => a.category === allocation.category ? i : -1).filter(i => i >= 0);
      for (const i of indexes) image(i, 230);
      heading('Scope & experience'); body(allocation.scope);
      heading('Deliverables'); body(allocation.deliverables || 'As described in the approved service scope.');
      body(`Quantity: ${allocation.quantity}\nCustomer allocation: INR ${allocation.amount.toLocaleString('en-IN')}`);
    }
    const unassigned = snapshot.assets.map((a, i) => !a.category && i > 0 ? i : -1).filter(i => i >= 0);
    if (unassigned.length) { page('A visual direction for your celebration'); for (const i of unassigned) image(i, 245); }
    page('Your investment, clearly presented');
    body('Approved service allocations and the total package price.');
    for (const a of snapshot.allocations) {
      if (doc.y > 670) doc.addPage();
      const y = doc.y;
      doc.font('Helvetica').fontSize(11).fillColor(ink);
      const h = Math.max(36, doc.heightOfString(safe(a.category), { width: width - 155 }) + 20);
      doc.text(safe(a.category), 48, y, { width: width - 155 });
      doc.text(`INR ${a.amount.toLocaleString('en-IN')}`, 48 + width - 150, y, { width: 150, align: 'right' });
      doc.moveTo(48, y + h - 9).lineTo(48 + width, y + h - 9).strokeColor('#E3DCD4').stroke();
      doc.y = y + h;
    }
    heading(`Total approved package: INR ${snapshot.total.toLocaleString('en-IN')}`);
    heading('Payment schedule'); body(snapshot.paymentTerms);
    heading('Exclusions'); body(snapshot.exclusions);
    page('The journey from here');
    heading('Execution roadmap'); body(snapshot.roadmap || 'Review this proposal with STARVNT. The event execution schedule will be coordinated through your event workspace.');
    heading('Finalization checklist');
    body('Vendor agreements: approved at generation.\nCommercial review: approved at generation.\nCustomer decision: review the current status in your authenticated dashboard.\nBooking and payment: continue through the separate STARVNT Core workflow.');
    heading('Review, refine, approve');
    body('Open My Event Proposal to ask questions, request changes, or approve this exact version. Proposal approval does not confirm a booking or verify a payment. References and AI-generated concepts are illustrative and are not guaranteed deliverables unless expressly included in the approved written scope.');
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(muted).text(`STARVNT  /  v${version.number}  /  ${i + 1} of ${pages.count}`, 48, doc.page.height - 58, { width, lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  } catch (error) { doc.destroy(); throw error; }
  return complete;
}
