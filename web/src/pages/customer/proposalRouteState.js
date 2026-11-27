export function proposalRouteContext(pathname, { id, eventParam, proposalParam } = {}) {
  if (proposalParam) return { proposalId: proposalParam, targetEventId: null };
  // Both IDs are MongoDB ObjectIds; the route, not an ID prefix, identifies them.
  if (id && pathname.startsWith('/customer/proposals/')) return { proposalId: id, targetEventId: null };
  return { proposalId: null, targetEventId: eventParam || (pathname.startsWith('/customer/events/') ? id : null) || null };
}
export function resolveEventProposal(context, proposals = []) {
  const match = context.targetEventId ? proposals.find(p => String(p.eventId) === String(context.targetEventId)) : proposals[0];
  return { ...context, proposalId: context.proposalId || match?.proposalId || null, hasProposals: proposals.length > 0 };
}
