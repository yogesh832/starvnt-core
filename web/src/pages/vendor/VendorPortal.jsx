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
  const notifRef = useRef(null);
  const [businessName, setBusinessName] = useState('Premium Moments');
  const [category, setCategory] = useState('Photography');

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await externalApi.call('/vendor/profile');
        if (res.ok && res.vendor) {
          if (res.vendor.businessName) setBusinessName(res.vendor.businessName);
          if (res.vendor.category) setCategory(res.vendor.category);
        }
      } catch (err) {
        if (user?.vendorOrganization?.businessName) {
          setBusinessName(user.vendorOrganization.businessName);
        }
      }
    }
    loadProfile();
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
    { to: 'calendar', label: 'Calendar', icon: 'calendar' },
    { to: 'portfolio', label: 'Portfolio', icon: 'gallery' },
    { to: 'services', label: 'Services', icon: 'services' },
    { to: 'availability', label: 'Availability', icon: 'availability' },
    { to: 'payments', label: 'Payments', icon: 'payments' },
    { to: 'reviews', label: 'Reviews', icon: 'star' },
    { to: 'analytics', label: 'Analytics', icon: 'reports' },
    { to: 'messages', label: 'Messages', icon: 'message' },
    { to: 'documents', label: 'Documents', icon: 'documents' },
    { to: 'profile', label: 'Profile', icon: 'profile' },
    { to: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <div className="min-h-screen bg-lavender flex">
      {navOpen && <div className="fixed inset-0 bg-navy/40 z-30 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 h-screen z-40 w-60 bg-white flex flex-col transform transition-transform lg:translate-x-0 ${navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="px-5 py-5"><LogoWord sub="Vendor OS" /></div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
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

        <div className="m-3 p-4 rounded-2xl bg-[#5244e8] text-white shadow-md">
          <div className="text-sm font-extrabold tracking-tight">Grow with STARVNT</div>
          <p className="text-[11px] text-white/80 mt-1 leading-relaxed">
            Get more visibility & qualified leads and upgrade bookings.
          </p>
          <button className="mt-3 w-full text-xs font-extrabold bg-white text-primary rounded-xl py-2 shadow-xs hover:bg-lavender transition">
            Upgrade to Pro
          </button>
        </div>

        {/* Account + logout */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0">
            {user?.fullName?.[0]?.toUpperCase()}
          </div>
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
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar with Dynamic Notification Bell */}
        <header className="bg-white/80 backdrop-blur sticky top-0 z-20 border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button className="lg:hidden text-ink/60" onClick={() => setNavOpen(true)} aria-label="Menu">☰</button>
          <div className="flex-1 max-w-xl flex items-center gap-2 bg-lavender rounded-xl px-3.5 py-2 text-sm text-muted">
            <Icon name="search" size={16} />
            <input className="bg-transparent flex-1 outline-none placeholder:text-muted/70" placeholder="Search enquiries, bookings, events..." />
          </div>

          <div className="flex items-center gap-2 ml-auto relative" ref={notifRef}>
            <button className="hidden sm:grid w-9 h-9 place-items-center rounded-xl hover:bg-lavender text-ink/60">
              <Icon name="help" size={18} />
            </button>

            {/* Notification Bell with Dynamic Dot & Dropdown */}
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender text-ink/60 transition cursor-pointer"
              title="Notifications"
            >
              <Icon name="bell" size={18} />
              {badgeCounts.unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-gray-100 p-4 z-50 animate-[pop_.18s_ease-out]">
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
                      <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-gray-100 grid place-items-center shrink-0 mt-0.5 text-xs">
                        {n.type === 'ENQUIRY' ? '📩' : n.type === 'QUOTE' ? '📑' : n.type === 'PAYMENT' ? '💰' : '🔔'}
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
            <div className="flex items-center gap-2.5 pl-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-sm font-bold shadow-xs">
                {businessName.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <div className="text-[13px] font-bold leading-tight">{businessName}</div>
                <div className="text-[10px] text-muted">Vendor • {category}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Workspace Routes */}
        <div className="flex-1 min-h-0">
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
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="profile" element={<ProfilePage user={user} business={businessName} />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </div>

        <footer className="px-6 py-3 flex items-center justify-between text-[10px] text-muted/70">
          <span>© 2026 STARVNT Universal Vendor OS. Authoritative Core Platform.</span>
          <span className="hidden sm:flex gap-4">Privacy · Terms · Help</span>
        </footer>
      </div>
    </div>
  );
}
