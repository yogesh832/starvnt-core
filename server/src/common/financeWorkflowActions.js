// UI affordances only. Authority, evidence and source-state checks stay in Core.
export function financeWorkflowActions(operation) {
  if (operation.status === 'REQUESTED') return ['APPROVE', 'REJECT'];
  if (operation.status === 'APPROVED') return [operation.method === 'RAZORPAY' ? 'PROCESS_PROVIDER' : 'RECORD_TRANSFER', 'FAIL'];
  if (['PROCESSING', 'UNDER_REVIEW'].includes(operation.status)) return operation.method === 'RAZORPAY'
    ? ['RECONCILE_PROVIDER'] : ['RECONCILE', 'RECONCILE_FAILED', 'FAIL'];
  return [];
}
