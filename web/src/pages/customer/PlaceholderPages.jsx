import { Link } from 'react-router-dom';
import { Empty } from './customerUi.jsx';

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
  return (
    <Placeholder title="Documents" subtitle="Contracts, invoices and files for your events.">
      <Empty title="No documents yet">Documents from your bookings will appear here. Uploading files isn't available yet.</Empty>
    </Placeholder>
  );
}

export function FavoritesPage() {
  return (
    <Placeholder title="Favorites" subtitle="Vendors and options you want to keep an eye on.">
      <Empty title="No favorites yet">Saving favorites isn't available yet. You can compare options from your event's plan.</Empty>
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
