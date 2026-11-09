import NotificationPreferences from '../../components/NotificationPreferences.jsx';
import { BackLink } from './customerUi.jsx';

export default function NotificationSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink to="/customer/settings">Settings</BackLink>
      <h1 className="text-2xl font-extrabold text-navy dark:text-white">Notifications</h1>
      <NotificationPreferences />
    </div>
  );
}
