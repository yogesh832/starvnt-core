import { CustomerEvent } from '../customer/models/index.js';
import { EventManifest, Proposal, ProposalVersion } from './models.js';
import { manifestContent, buildManifest } from './manifest.service.js';
import { createPreliminary, publishVersion } from './proposal.service.js';
import { renderProposalVersion } from './render.service.js';
import { proposalError } from './utils.js';

/**
 * Customer self-serve preliminary proposal.
 *
 * Every event can show a watermarked PRELIMINARY concept built from the
 * customer's own event details. It is never approvable, contains no
 * unapproved pricing, and never replaces a FINAL proposal or one STARVNT is
 * still preparing. The approval gate for FINAL proposals is untouched.
 */

const inFlight = new Map(); // eventId → promise (one build per event at a time)

const ACTIVE_FINAL = ['APPROVED_FOR_GENERATION', 'QUALITY_REVIEW', 'GENERATED', 'SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED', 'CHANGE_REQUESTED', 'CUSTOMER_APPROVED', 'CUSTOMER_DECLINED', 'FAILED'];
const OPEN_PRELIMINARY = ['SENT_TO_CUSTOMER', 'CUSTOMER_VIEWED'];

const PREVIEW_TIMEOUT_MS = Number(process.env.PROPOSAL_PREVIEW_TIMEOUT_MS || 90000);

export async function ensureCustomerPreview(customerId, eventId) {
  const key = String(eventId);
  if (!inFlight.has(key)) {
    // A stuck build must never block later clicks: the slot is released after the timeout.
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(proposalError('PREVIEW_TIMEOUT', 'Preparing your preview took too long. Please try again.', 503)), PREVIEW_TIMEOUT_MS);
    });
    const run = Promise.race([buildPreview(customerId, eventId), timeout]).finally(() => { clearTimeout(timer); inFlight.delete(key); });
    inFlight.set(key, run);
  }
  return inFlight.get(key);
}

async function buildPreview(customerId, eventId) {
  const event = await CustomerEvent.findOne({ _id: eventId, customer: customerId }).select('_id status').lean();
  if (!event) throw proposalError('EVENT_NOT_FOUND', 'Event not found.', 404);

  const proposal = await Proposal.findOne({ event: event._id }).lean();
  if (proposal) {
    // A final proposal (sent or in preparation) always wins over a self-serve preview.
    const final = await ProposalVersion.findOne({ proposal: proposal._id, kind: 'FINAL', status: { $in: ACTIVE_FINAL } }).sort({ version: -1 }).lean();
    if (final) {
      if (proposal.publishedVersion) return { proposalId: String(proposal._id), version: proposal.publishedVersion, kind: 'FINAL', reused: true };
      throw proposalError('FINAL_IN_PREPARATION', 'STARVNT is finishing your final proposal. It will appear here as soon as it is checked.', 409);
    }
  }

  const content = await manifestContent(event._id);
  // A preview may show chosen-but-unconfirmed services; the final proposal still needs a confirmed one.
  const hasChosen = content.requirements.some((r) => r.status === 'included' || r.status === 'pending');
  const blocking = content.validation.errors.filter((e) => !(e.code === 'NO_CONFIRMED_SERVICES' && hasChosen));
  if (blocking.length) {
    throw proposalError('EVENT_DETAILS_INCOMPLETE', 'Add the missing event details to see your proposal.', 409, {
      problems: blocking.map((e) => e.message),
    });
  }
  if (!hasChosen) {
    throw proposalError('EVENT_DETAILS_INCOMPLETE', 'Add the missing event details to see your proposal.', 409, {
      problems: ['Choose at least one service for your event.'],
    });
  }

  // Reuse the current preview when nothing in the event has changed since it was made.
  if (proposal?.publishedVersion) {
    const current = await ProposalVersion.findOne({ proposal: proposal._id, version: proposal.publishedVersion }).lean();
    if (current?.kind === 'PRELIMINARY' && OPEN_PRELIMINARY.includes(current.status) && current.pdf?.storageKey) {
      const manifest = await EventManifest.findById(current.manifest).select('contentHash').lean();
      if (manifest?.contentHash === content.contentHash) {
        return { proposalId: String(proposal._id), version: current.version, kind: 'PRELIMINARY', reused: true };
      }
    }
  }

  const actor = `customer:${customerId}`;
  const latest = await EventManifest.findOne({ event: event._id }).sort({ version: -1 }).lean();
  if (!latest || latest.contentHash !== content.contentHash || !['DRAFT', 'FROZEN'].includes(latest.status)) {
    await buildManifest(event._id, { actor, actorType: 'CUSTOMER' });
  }
  const version = await createPreliminary(event._id, { actor });
  const rendered = await renderProposalVersion(version._id);
  if (!rendered.rendered || !rendered.qaPassed) {
    throw proposalError('PREVIEW_NOT_AVAILABLE', 'Your preview could not be prepared right now. Please try again shortly.', 503);
  }
  await publishVersion(version._id, { actor });
  return { proposalId: String(version.proposal), version: version.version, kind: 'PRELIMINARY', reused: false };
}
