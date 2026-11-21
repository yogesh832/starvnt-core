// CI-only renderer preflight: synthetic content, no database or provider calls.
import { existsSync } from 'node:fs';
const rendererUrl = new URL('../src/proposals/render.service.js', import.meta.url);
if (existsSync(rendererUrl)) {
  const { renderPdf, pdfText, runQa, closeRenderer } = await import(rendererUrl);
  const { composeProposalHtml } = await import('../src/proposals/composer.js');
  const snapshot = { kind: 'FINAL', event: { type: 'wedding', typeLabel: 'Wedding', date: '2027-06-15', city: 'Kolkata', guestCount: 300 }, services: [], visuals: {}, customerProvided: [], pending: [], exclusions: [] };
  const meta = { proposalNumber: 'CI-SYNTHETIC', version: 1, customerName: 'CI Fixture' };
  try {
    const html = composeProposalHtml(snapshot, meta);
    const { pdf, layout } = await renderPdf(html, meta, { preliminary: false });
    const { text, pages } = await pdfText(pdf);
    const qa = runQa({ snapshot, html, text, pages, layout, preliminary: false });
    console.log(JSON.stringify({ preflight: 'PDF renderer', ...qa, pages: pages.length, layout, pageNumberText: pages.map(page => page.match(/Page.{0,90}/g) || []), pageEnds: pages.map(page => page.slice(-180)) }));
    if (!qa.passed) process.exitCode = 1;
  } finally { await closeRenderer(); }
} else {
  console.log('No PDF renderer in this branch; preflight not applicable.');
}
