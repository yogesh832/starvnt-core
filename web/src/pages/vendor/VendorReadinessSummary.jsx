import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';

const human = value => typeof value === 'string' ? value.replaceAll('_', ' ').toLowerCase() : 'Unavailable';
const PRIORITY = ['BUSINESS_PROFILE', 'PAN', 'BANK', 'PORTFOLIO', 'OPERATIONS', 'ACTIVATION'];

/** An explanation of the existing Core evaluator, never a client eligibility rule. */
export default function VendorReadinessSummary({ status, unavailable = false, compact = false, onRetry }) {
  const metrics = Array.isArray(status?.metrics) ? status.metrics : [];
  const percent = !unavailable && Number.isFinite(status?.completionPercentage) ? status.completionPercentage : null;
  const actions = PRIORITY.map(key => metrics.find(metric => metric.key === key && metric.complete === false && metric.nextAction)).filter(Boolean).slice(0, 3);
  const c = status?.checklist || {};
  const groups = [['Profile', c.profile], ['Services', c.services], ['Gear & team', c.capabilities && c.capacity && c.resources], ['Coverage', c.locations && c.coverage], ['Availability', c.availability], ['Portfolio', c.portfolio]];
  return <section className={`vendor-command-readiness ${compact ? 'lg:hidden' : ''}`} aria-labelledby={compact ? 'home-readiness-title' : 'business-readiness-title'}>
    <div className="vendor-readiness-heading"><div><span className="vendor-section-kicker">YOUR NEXT CHAPTER</span><h2 id={compact ? 'home-readiness-title' : 'business-readiness-title'}>Business Hub & Readiness</h2></div><Link to="/vendor/readiness">View journey <Icon name="chevronRight" size={15} /></Link></div>
    {percent == null ? <div className="vendor-source-notice" role="status"><strong>Readiness data unavailable</strong><p>Your verification and eligibility have not changed. Refresh to retrieve the current evaluator.</p>{onRetry && <button type="button" onClick={onRetry}>Retry readiness</button>}</div> : <>
      <div className="vendor-readiness-progress"><div className="vendor-readiness-ring" role="img" aria-label={`Operating onboarding ${percent}% complete`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" /><circle cx="50" cy="50" r="43" strokeDasharray={`${Math.max(0, Math.min(100, percent)) * 2.702} 270.2`} /></svg><strong>{percent}%</strong></div><div><h3>{percent === 100 ? 'Your operating setup is complete' : 'Build a business that is ready to deliver'}</h3><p>{status.onboardingSteps?.completed ?? '—'} of {status.onboardingSteps?.total ?? '—'} operating groups complete. Verification, activation and matching are separate decisions.</p></div></div>
      <ol className="vendor-readiness-journey">{groups.map(([label, complete]) => <li key={label} data-complete={Boolean(complete)}><span><Icon name={complete ? 'check' : 'profile'} size={14} /></span><small>{label}</small></li>)}</ol>
      <dl className="vendor-readiness-decisions">{[
        ['Verification', status.readiness?.verificationStatus], ['Activation', status.activationState], ['Matching', typeof status.matchingEligible === 'boolean' ? status.matchingEligible ? 'ELIGIBLE' : 'LOCKED' : null],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{human(value)}</dd></div>)}</dl>
      <div className="vendor-today-heading"><h3>Today’s Action Center</h3><span>{actions.length ? `${actions.length} next actions` : 'Your next step'}</span></div>
      {actions.length ? <ul className="vendor-readiness-actions">{actions.map(action => <li key={action.key}><div><strong>{action.label}</strong><p>{action.pendingReason}</p></div><Link to={action.nextAction}>Review <Icon name="chevronRight" size={14} /></Link></li>)}</ul> : <p className="vendor-readiness-next">{status.matchingEligible ? <>Your setup is ready. <Link to="/vendor/enquiries">Review eligible enquiries →</Link></> : <>Follow the named requirements in <Link to="/vendor/readiness">your readiness journey →</Link></>}</p>}
      {status.computedAt && <p className="vendor-evaluator-source">Core evaluator · {new Date(status.computedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · {status.calculationVersion}</p>}
    </>}
  </section>;
}
