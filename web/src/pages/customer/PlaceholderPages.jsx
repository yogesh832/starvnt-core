import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { Empty, useLoad } from './customerUi.jsx';
import { formatDate, formatINR } from './format.js';

/** Honest empty pages for sections that have no backend yet. No sample data. */
function Placeholder({ title, subtitle, children }) {
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div>
        <h1 className="text-xl font-extrabold text-navy">{title}</h1>
        <p className="text-xs text-muted mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function DocumentsPage() {
  const docs = useLoad(() => customerApi.documents(), []);
  const [downloading, setDownloading] = useState(null);
  const [contract, setContract] = useState({ title: '', fileUrl: '', fileName: '' });
  const [savingContract, setSavingContract] = useState(false);
  const [contractError, setContractError] = useState('');

  const download = async (doc) => {
    try {
      setDownloading(doc.id);
      const blob = await customerApi.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.title || 'starvnt-document'}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const saveContract = async (e) => {
    e.preventDefault();
    setContractError('');
    try {
      setSavingContract(true);
      await customerApi.createContractDocument(contract);
      window.location.reload();
    } catch (err) {
      setContractError(errorText(err, 'Could not save this contract.'));
    } finally {
      setSavingContract(false);
    }
  };

  if (docs.loading && !docs.data) {
    return (
      <Placeholder title="Documents" subtitle="Contracts, invoices and files for your events.">
        <div className="text-sm text-muted">Loading documents...</div>
      </Placeholder>
    );
  }

  if (docs.error) {
    return (
      <Placeholder title="Documents" subtitle="Contracts, invoices and files for your events.">
        <Empty title="Documents unavailable">{errorText(docs.error)}</Empty>
      </Placeholder>
    );
  }

  const items = docs.data?.documents || [];
  return (
    <Placeholder title="Documents" subtitle="Contracts, invoices and files for your events.">
      <form onSubmit={saveContract} className="bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-3">
        <div>
          <div className="text-sm font-extrabold text-navy dark:text-white">Add contract</div>
          <p className="text-[11px] text-muted dark:text-slate-400 mt-0.5">Add a secure uploaded contract link from media storage or your signed document system.</p>
        </div>
        {contractError && <div className="rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold px-3 py-2">{contractError}</div>}
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            value={contract.title}
            onChange={(e) => setContract((v) => ({ ...v, title: e.target.value }))}
            placeholder="Contract title"
            className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#101321] px-3 py-2 text-xs outline-none focus:border-primary text-navy dark:text-white"
          />
          <input
            value={contract.fileUrl}
            onChange={(e) => setContract((v) => ({ ...v, fileUrl: e.target.value }))}
            placeholder="https:// secure file URL"
            className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#101321] px-3 py-2 text-xs outline-none focus:border-primary text-navy dark:text-white sm:col-span-2"
          />
          <input
            value={contract.fileName}
            onChange={(e) => setContract((v) => ({ ...v, fileName: e.target.value }))}
            placeholder="File name, optional"
            className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#101321] px-3 py-2 text-xs outline-none focus:border-primary text-navy dark:text-white sm:col-span-2"
          />
          <button
            disabled={savingContract}
            className="rounded-xl bg-primary text-white px-3 py-2 text-xs font-extrabold hover:bg-primary-dark disabled:opacity-60"
          >
            {savingContract ? 'Saving...' : 'Save contract'}
          </button>
        </div>
      </form>
      {items.length === 0 ? (
        <Empty title="No documents yet">Contracts, receipts and invoices from your bookings will appear here.</Empty>
      ) : (
        <div className="grid gap-3">
          {items.map((doc) => (
            <div key={doc.id} className="bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center shrink-0">
                  <Icon name="documents" size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-navy dark:text-white truncate">{doc.title}</div>
                  <div className="text-[11px] text-muted dark:text-slate-400 mt-0.5">
                    {[doc.event?.title, doc.vendorName, doc.amount != null && formatINR(doc.amount), doc.issuedAt && formatDate(String(doc.issuedAt).slice(0, 10))].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted dark:text-slate-500 mt-2">{doc.type} · {doc.status}</div>
                </div>
              </div>
              <button
                type="button"
                disabled={!doc.canDownload || downloading === doc.id}
                onClick={() => download(doc)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary text-white px-3 py-2 text-[11px] font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-dark transition"
              >
                <Icon name="documents" size={12} /> {downloading === doc.id ? 'Preparing' : 'PDF'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Placeholder>
  );
}

export function FavoritesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const favs = useLoad(() => customerApi.favorites(), [refreshKey]);
  const [removing, setRemoving] = useState(null);

  const remove = async (favorite) => {
    try {
      setRemoving(favorite.id);
      await customerApi.removeFavorite(favorite.id);
      setRefreshKey((v) => v + 1);
    } finally {
      setRemoving(null);
    }
  };

  if (favs.loading && !favs.data) {
    return (
      <Placeholder title="Favorites" subtitle="Vendors and options you want to keep an eye on.">
        <div className="text-sm text-muted">Loading favorites...</div>
      </Placeholder>
    );
  }

  if (favs.error) {
    return (
      <Placeholder title="Favorites" subtitle="Vendors and options you want to keep an eye on.">
        <Empty title="Favorites unavailable">{errorText(favs.error)}</Empty>
      </Placeholder>
    );
  }

  const items = favs.data?.favorites || [];
  return (
    <Placeholder title="Favorites" subtitle="Vendors and options you want to keep an eye on.">
      {items.length === 0 ? (
        <Empty title="No favorites yet">Selected vendors and saved options will appear here.</Empty>
      ) : (
        <div className="grid gap-3">
          {items.map((favorite) => (
            <div key={favorite.id} className="bg-white dark:bg-[#161926] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-extrabold text-navy dark:text-white">{favorite.vendorName}</div>
                  <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-lavender dark:bg-white/10 text-primary dark:text-[#a5b4fc] px-2 py-0.5">
                    {favorite.source === 'selected_option' ? 'Selected' : 'Saved'}
                  </span>
                </div>
                <div className="text-xs text-muted dark:text-slate-400 mt-1">
                  {[favorite.packageName, favorite.category, favorite.price != null && formatINR(favorite.price)].filter(Boolean).join(' · ')}
                </div>
                {favorite.event?.title && (
                  <div className="text-[11px] text-muted dark:text-slate-500 mt-1">For {favorite.event.title}{favorite.event.eventDate ? ` on ${formatDate(favorite.event.eventDate)}` : ''}</div>
                )}
              </div>
              {favorite.removable ? (
                <button
                  type="button"
                  disabled={removing === favorite.id}
                  onClick={() => remove(favorite)}
                  className="shrink-0 w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 text-muted dark:text-slate-300 hover:text-red-600 hover:border-red-200 grid place-items-center disabled:opacity-50"
                  aria-label="Remove favorite"
                >
                  <Icon name="trash" size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Placeholder>
  );
}

export function SettingsPage() {
  return (
    <Placeholder title="Settings" subtitle="Your account.">
      <div className="bg-white rounded-2xl shadow-sm p-2">
        <Link to="/customer/me" className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-lavender text-sm font-semibold text-navy">
          Profile (name, phone) <span className="text-muted">›</span>
        </Link>
      </div>
      <Empty title="More settings coming">Notification and privacy preferences aren't available yet.</Empty>
    </Placeholder>
  );
}
