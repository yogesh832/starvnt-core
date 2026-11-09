import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LogoWord } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { externalApi } from '../lib/api.js';

export default function PublicVendorProfile() {
  const { vendorId } = useParams();
  const [state, setState] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    externalApi.call(`/vendors/${encodeURIComponent(vendorId)}/public-profile`).then(profile => {
      if (current) setState({ vendorId, profile });
    }).catch(error => {
      if (current) setState({ vendorId, error: error.status === 404 ? 'unavailable' : 'retry' });
    });
    return () => { current = false; };
  }, [vendorId, retry]);

  const result = state?.vendorId === vendorId ? state : null;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="inline-flex rounded-xl bg-white px-4 py-3 shadow-sm"><LogoWord /></Link>
      <article className="mt-8 rounded-3xl bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">STARVNT business profile</p>
        {result?.profile ? <>
          <h1 className="mt-3 break-words text-3xl font-bold text-navy">{result.profile.name}</h1>
          <p className="mt-2 text-muted">{result.profile.category}</p>
          {!!result.profile.socialLinks.length && <ul className="mt-6 flex flex-wrap gap-3">
            {result.profile.socialLinks.map(link => <li key={link.platform}>
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-semibold text-primary">
                <Icon name="link" size={16} /> {link.label}
              </a>
            </li>)}
          </ul>}
        </> : <div role="status" className="mt-4 text-sm">
          {!result ? 'Loading profile…' : result.error === 'unavailable' ? 'This profile is unavailable.' : <>
            Could not load this profile. <button type="button" className="underline text-primary"
              onClick={() => { setState(null); setRetry(value => value + 1); }}>Retry</button>
          </>}
        </div>}
      </article>
    </div>
  </main>;
}
