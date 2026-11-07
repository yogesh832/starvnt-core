import { Link, useSearchParams } from 'react-router-dom';
import { LogoWord } from '../components/ui.jsx';
import { PORTAL_SURFACE } from '../lib/portalAccess.js';
import { useSignupDocuments } from '../lib/useSignupDocuments.js';

const pages = {
  privacy: { title: 'Privacy Policy', companion: 'Terms of Service', companionPath: '/terms' },
  terms: { title: 'Terms of Service', companion: 'Privacy Policy', companionPath: '/privacy' },
};

/** Approved legal text must be supplied by the product/legal owner before publication. */
export default function PublicPolicyPage({ kind = 'privacy' }) {
  const page = pages[kind] || pages.privacy;
  const [search] = useSearchParams();
  const audience = search.get('for');
  const accountType = audience === 'vendor' ? 'VENDOR' : audience === 'customer' ? 'CUSTOMER' : PORTAL_SURFACE;
  const { documents, loading, error } = useSignupDocuments(accountType);
  const document = documents?.find(row => row.kind === kind);
  const title = kind === 'terms' && accountType === 'VENDOR' ? 'Vendor Terms' : page.title;
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@starvnt.com';
  return <main className="min-h-screen bg-[#f7f7fb] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="inline-flex rounded-xl bg-white px-4 py-3 shadow-sm"><LogoWord /></Link>
      <article className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">STARVNT · Legal</p>
        <h1 className="mt-2 text-3xl font-black text-navy">{title}</h1>
        {document ? <>
          <p className="mt-3 text-sm text-muted">Version {document.version} · Effective {document.effectiveFrom.slice(0, 10)}</p>
          <div className="mt-6 whitespace-pre-wrap break-words text-sm leading-7">{document.body}</div>
        </> : <p role="status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          {loading ? 'Loading legal document…' : error ? 'Could not load this document. Refresh to retry.' : 'This document has yet to be published.'}
          {!loading && <> Contact <a className="font-bold underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> for help.</>}
        </p>}
        <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-100 pt-5 text-sm font-bold">
          <Link to={`${page.companionPath}?for=${accountType.toLowerCase()}`} className="text-primary hover:underline">{page.companion}</Link>
          <Link to="/" className="text-muted hover:text-navy">Back to STARVNT</Link>
        </div>
      </article>
    </div>
  </main>;
}
