import { formatINR } from '../pages/customer/format.js';
export default function FinancialOverview({ truth }) {
  const m = truth?.metrics;
  if (!m) return <p className="text-sm">Budget summary is unavailable.</p>;
  return <div className="space-y-3 text-sm"><dl className="grid grid-cols-2 gap-3">{[
    ['Budget target', m.budgetType === 'unset' ? null : m.totalBudget], ['Committed', m.committedAmount], ['Verified payments', m.paidAmount], ['Projected total', m.projectedTotal], ['Remaining budget', m.budgetType === 'unset' ? null : m.remainingAmount], ['Budget variance', m.budgetType === 'unset' ? null : m.budgetVariance],
  ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="font-bold">{value == null ? 'Not set' : formatINR(value)}</dd></div>)}</dl>
    <p className="text-xs text-muted">Committed amounts include active reservations. Projected total uses current quote and commitment records; it is an estimate, not a payment.</p>
    {m.budgetVariance > 0 && <p role="status" className="text-amber-800">Projected costs exceed your budget. Review the pending decisions.</p>}
  </div>;
}
