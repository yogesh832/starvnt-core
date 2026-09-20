import { useState, useEffect, useRef } from 'react';
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { LogoWord } from '../../components/ui.jsx';
import { externalApi } from '../../lib/api.js';
import DashboardHome from './pages/DashboardHome.jsx';
import Enquiries from './pages/Enquiries.jsx';
import Quotes from './pages/Quotes.jsx';
import Bookings from './pages/Bookings.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import Messages from './pages/Messages.jsx';
import PortfolioPage from './pages/PortfolioPage.jsx';
import { AnalyticsPage, PaymentsPage, ReviewsPage } from './pages/InsightPages.jsx';
import {
  ServicesPage,
  AvailabilityPage,
  DocumentsPage,
  ProfilePage,
  SettingsPage,
} from './pages/BusinessPages.jsx';

export default function VendorPortal() {
  const { user, logout } = useExternalAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const notifRef = useRef(null);
  const [businessName, setBusinessName] = useState(user?.fullName ? `${user.fullName}'s Brand` : 'My Brand');
  const [category, setCategory] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await externalApi.call('/vendor/profile');
        if (res.ok && res.vendor) {
          if (res.vendor.businessName) setBusinessName(res.vendor.businessName);
          if (res.vendor.category) setCategory(res.vendor.category);
          setProfilePicUrl(res.vendor.profilePicUrl || '');
        }
      } catch (err) {
        if (user?.vendorOrganization?.businessName) {
          setBusinessName(user.vendorOrganization.businessName);
        }
      }
    }
    loadProfile();

    const handleProfileUpdate = () => loadProfile();
    window.addEventListener('vendorProfileUpdated', handleProfileUpdate);
    return () => window.removeEventListener('vendorProfileUpdated', handleProfileUpdate);
  }, [user]);

  const [badgeCounts, setBadgeCounts] = useState({
    enquiriesCount: 0,
    quotesCount: 0,
    bookingsCount: 0,
    unreadNotificationsCount: 0,
  });
  const [notifications, setNotifications] = useState([]);

  // Fetch real dynamic badge counts and notifications from backend
  async function fetchLiveBadges() {
    try {
      const [bRes, nRes] = await Promise.all([
        externalApi.call('/vendor/badge-counts'),
        externalApi.call('/vendor/notifications'),
      ]);

      if (bRes.ok) {
        setBadgeCounts({
          enquiriesCount: bRes.enquiriesCount || 0,
          quotesCount: bRes.quotesCount || 0,
          bookingsCount: bRes.bookingsCount || 0,
          unreadNotificationsCount: bRes.unreadNotificationsCount || 0,
        });
      }

      if (nRes.ok) {
        setNotifications(nRes.notifications || []);
      }
    } catch (err) {
      console.warn('[VendorPortal] Fetch badges error:', err.message);
    }
  }

  useEffect(() => {
    fetchLiveBadges();
    const interval = setInterval(fetchLiveBadges, 15000); // Polling every 15s for live reactivity
    return () => clearInterval(interval);
  }, []);

  // Close notifications dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleMarkAsRead(notifId, link) {
    try {
      await externalApi.call(`/vendor/notifications/${notifId}/read`, { method: 'PUT' });
    } catch (err) {
      // Local fallback
    }
    setNotifications((prev) =>
      prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n))
    );
    setBadgeCounts((prev) => ({
      ...prev,
      unreadNotificationsCount: Math.max(0, prev.unreadNotificationsCount - 1),
    }));
    setNotifOpen(false);
    if (link) navigate(link);
  }

  async function handleMarkAllAsRead() {
    try {
      await externalApi.call('/vendor/notifications/read-all', { method: 'PUT' });
    } catch (err) {
      // Local fallback
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setBadgeCounts((prev) => ({ ...prev, unreadNotificationsCount: 0 }));
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const navItems = [
    { to: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: 'enquiries', label: 'Enquiries', icon: 'message', badge: badgeCounts.enquiriesCount || null },
    { to: 'quotes', label: 'Quotes', icon: 'quotes', badge: badgeCounts.quotesCount || null },
    { to: 'bookings', label: 'Bookings', icon: 'bookings', badge: badgeCounts.bookingsCount || null },
    { to: 'portfolio', label: 'Portfolio', icon: 'gallery' },
    { to: 'services', label: 'Services', icon: 'services' },
    { to: 'availability', label: 'Availability', icon: 'availability' },
    { to: 'payments', label: 'Payments', icon: 'payments' },
    { to: 'reviews', label: 'Reviews', icon: 'star' },
    { to: 'analytics', label: 'Analytics', icon: 'reports' },
    { to: 'messages', label: 'Messages', icon: 'message' },
    { to: 'profile', label: 'Profile & Hub', icon: 'profile' },
  ];

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-lavender">
      {navOpen && <div className="fixed inset-0 bg-navy/40 z-30 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static top-0 left-0 h-screen z-40 w-64 bg-white flex flex-col shrink-0 border-r border-gray-100 transition-transform duration-200 ease-in-out ${navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 lg:border-none">
          <LogoWord sub="Vendor OS" />
          <button
            onClick={() => setNavOpen(false)}
            className="lg:hidden w-8 h-8 rounded-xl text-muted hover:bg-lavender grid place-items-center transition"
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13px] transition ${
                  isActive
                    ? 'bg-[#ede9fe] text-primary font-bold shadow-xs'
                    : 'text-ink/70 font-medium hover:bg-lavender hover:text-navy'
                }`
              }
            >
              <Icon name={item.icon} size={17} className="shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="w-5 h-5 min-w-[20px] rounded-full bg-[#e62e2e] text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-xs">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Account + logout */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2.5">
          {profilePicUrl || user?.avatarUrl ? (
            <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0">
              {user?.fullName?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate">{user?.fullName}</div>
            <div className="text-[10px] text-muted truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-y-auto overflow-x-hidden pb-16 lg:pb-0 w-full">
        {/* Top bar with Dynamic Notification Bell & Mobile Search */}
        <header className="bg-white/95 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-4 shadow-xs shrink-0 w-full">
          <button
            className="lg:hidden w-9 h-9 grid place-items-center rounded-xl text-ink/70 hover:bg-lavender transition shrink-0"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation menu"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md flex items-center gap-2.5 bg-gray-50 border border-gray-200/80 rounded-xl px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-navy min-w-0 shadow-inner focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus-within:bg-gray-900">
            <Icon name="search" size={15} className="shrink-0 text-muted" />
            <input
              className="bg-transparent flex-1 outline-none placeholder:text-muted/60 text-xs sm:text-sm w-full min-w-0 font-medium"
              placeholder="Search enquiries, bookings..."
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto shrink-0 relative" ref={notifRef}>
            <button
              className="hidden sm:grid w-9 h-9 place-items-center rounded-xl hover:bg-lavender text-ink/60 transition shrink-0"
              title="Help & Support"
            >
              <Icon name="help" size={18} />
            </button>

            {/* Calendar Header Button */}
            <button
              onClick={() => navigate('/vendor/calendar')}
              className="w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender text-ink/60 transition cursor-pointer shrink-0"
              title="Vendor Calendar & Blocked Dates"
              aria-label="Vendor Calendar"
            >
              <Icon name="calendar" size={18} />
            </button>

            {/* Notification Bell with Dynamic Dot & Dropdown */}
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender text-ink/60 transition cursor-pointer shrink-0"
              title="Notifications"
              aria-label="Notifications"
            >
              <Icon name="bell" size={18} />
              {badgeCounts.unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 p-4 z-50 animate-[pop_.18s_ease-out]">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-navy">Notifications</h3>
                    {badgeCounts.unreadNotificationsCount > 0 && (
                      <span className="text-[10px] font-bold bg-primary-soft text-primary px-2 py-0.5 rounded-full">
                        {badgeCounts.unreadNotificationsCount} new
                      </span>
                    )}
                  </div>
                  {badgeCounts.unreadNotificationsCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto mt-2">
                  {notifications.map((n) => (
                    <div
                      key={n._id}
                      onClick={() => handleMarkAsRead(n._id, n.link)}
                      className={`p-3 rounded-2xl transition cursor-pointer flex items-start gap-3 hover:bg-lavender/50 ${
                        !n.isRead ? 'bg-primary-soft/30' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-lavender/70 text-primary grid place-items-center shrink-0 mt-0.5">
                        <Icon
                          name={
                            n.type === 'ENQUIRY'
                              ? 'message'
                              : n.type === 'QUOTE'
                              ? 'quotes'
                              : n.type === 'PAYMENT'
                              ? 'wallet'
                              : 'bell'
                          }
                          size={14}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold truncate ${!n.isRead ? 'text-primary' : 'text-navy'}`}>
                            {n.title}
                          </span>
                          {!n.isRead && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{n.message}</p>
                      </div>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div className="py-8 text-center text-xs text-muted">No notifications yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* Profile Avatar */}
            <div
              onClick={() => navigate('/vendor/profile')}
              className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-full sm:rounded-xl transition select-none cursor-pointer"
              role="button"
              tabIndex={0}
            >
              {profilePicUrl || user?.avatarUrl ? (
                <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-xs" />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-xs sm:text-sm font-bold shadow-xs">
                  {(businessName || user?.fullName || 'VN').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block">
                <div className="text-[13px] font-bold leading-tight truncate max-w-[150px]">{businessName || user?.fullName || 'Vendor'}</div>
                <div className="text-[10px] text-muted truncate max-w-[150px]">Vendor • {category || 'Profile Incomplete'}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Workspace Routes */}
        <div className="flex-1 min-h-0 w-full min-w-0">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardHome business={businessName} />} />
            <Route path="enquiries" element={<Enquiries />} />
            <Route path="quotes" element={<Quotes />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="messages" element={<Messages />} />
            <Route path="documents" element={<DocumentsPage user={user} business={businessName} />} />
            <Route path="profile" element={<ProfilePage user={user} business={businessName} />} />
            <Route path="settings" element={<SettingsPage user={user} business={businessName} />} />
          </Routes>
        </div>

        <footer className="px-6 py-3 hidden sm:flex items-center justify-between text-[10px] text-muted/70">
          <span>© 2026 STARVNT Universal Vendor OS. Authoritative Core Platform.</span>
          <span className="flex gap-4">Privacy · Terms · Help</span>
        </footer>

        {/* Mobile Bottom Navigation Bar (Phone Screens) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-2 py-1.5 flex items-center justify-around shadow-lg">
          <NavLink
            to="dashboard"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="dashboard" size={19} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="enquiries"
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="message" size={19} />
            <span>Leads</span>
            {badgeCounts.enquiriesCount > 0 && (
              <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                {badgeCounts.enquiriesCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="bookings"
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="bookings" size={19} />
            <span>Bookings</span>
            {badgeCounts.bookingsCount > 0 && (
              <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                {badgeCounts.bookingsCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="calendar"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="calendar" size={19} />
            <span>Calendar</span>
          </NavLink>

          <button
            onClick={() => setNavOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold text-muted hover:text-navy transition"
          >
            <Icon name="menu" size={19} />
            <span>More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
