import { Link } from 'react-router-dom';
import { LogoWord } from '../components/ui.jsx';

const pages = {
  privacy: { title: 'Privacy Policy', companion: 'Terms of Service', companionPath: '/terms' },
  terms: { title: 'Terms of Service', companion: 'Privacy Policy', companionPath: '/privacy' },
};

/** Approved legal text must be supplied by the product/legal owner before publication. */
export default function PublicPolicyPage({ kind = 'privacy' }) {
  const page = pages[kind] || pages.privacy;
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@starvnt.com';
  return <main className="min-h-screen bg-[#f7f7fb] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="inline-flex rounded-xl bg-white px-4 py-3 shadow-sm"><LogoWord /></Link>
      <article className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">STARVNT · Legal</p>
        <h1 className="mt-2 text-3xl font-black text-navy">{page.title}</h1>
        <div role="status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          This document is not published yet. STARVNT is preparing the approved {kind === 'privacy' ? 'privacy notice' : 'service terms'} for this page. Please contact <a className="font-bold underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> if you need this information before continuing.
        </div>
        <p className="mt-6 text-sm text-muted">The final document will appear here after it has been approved by STARVNT.</p>
        <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-100 pt-5 text-sm font-bold">
          <Link to={page.companionPath} className="text-primary hover:underline">{page.companion}</Link>
          <Link to="/" className="text-muted hover:text-navy">Back to STARVNT</Link>
        </div>
      </article>
    </div>
  </main>;
}
