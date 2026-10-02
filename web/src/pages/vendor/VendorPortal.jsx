import { useState, useEffect, useRef } from 'react';
import { NavLink, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { LogoMark, LogoWord } from '../../components/ui.jsx';
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
import VendorAura from './VendorAura.jsx';

export default function VendorPortal() {
  const { user, logout } = useExternalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = location.pathname.split('/')[2] || 'dashboard';
  const [auraOpen, setAuraOpen] = useState(false);
  const [auraPrompt, setAuraPrompt] = useState(null);

  function askAura(text) {
    if (text) setAuraPrompt({ id: Date.now(), text });
    setAuraOpen(true);
  }

  // Profile setup status (same checklist as the dashboard's 5 onboarding steps).
  const [setup, setSetup] = useState(null);
  async function loadSetup() {
    try {
      const res = await externalApi.call('/vendor/activation-status');
      if (res?.status?.checklist) setSetup({ percent: res.status.completionPercentage ?? 0, checklist: res.status.checklist });
    } catch {
      /* setup card simply stays hidden */
    }
  }

  // Re-check when the vendor moves between pages (they may have finished a step there)
  // and whenever a profile change is announced (Profile page, Aura+ chat).
  useEffect(() => {
    loadSetup();
  }, [location.pathname]);
  useEffect(() => {
    const onUpdate = () => loadSetup();
    window.addEventListener('vendorProfileUpdated', onUpdate);
    return () => window.removeEventListener('vendorProfileUpdated', onUpdate);
  }, []);

  // Listen for openVendorAura events dispatched anywhere in the vendor dashboard
  useEffect(() => {
    const onOpenAura = (e) => {
      const text = e.detail?.text || e.detail?.prompt || '';
      askAura(text);
    };
    window.addEventListener('openVendorAura', onOpenAura);
    return () => window.removeEventListener('openVendorAura', onOpenAura);
  }, []);

  // New vendor (setup incomplete): open Aura+ once per sign-in so it can walk them through setup.
  useEffect(() => {
    if (!setup || setup.percent >= 100) return;
    try {
      if (sessionStorage.getItem('vendor_aura_setup_opened')) return;
      sessionStorage.setItem('vendor_aura_setup_opened', '1');
    } catch {
      return;
    }
    setAuraOpen(true);
  }, [setup]);
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isSidebarMini, setIsSidebarMini] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const sectionReadInFlightRef = useRef(new Set());
  const [businessName, setBusinessName] = useState(user?.fullName ? `${user.fullName}'s Brand` : 'My Brand');
  const [category, setCategory] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [googleRating, setGoogleRating] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await externalApi.call('/vendor/profile');
        if (res.ok && res.vendor) {
          if (res.vendor.businessName) setBusinessName(res.vendor.businessName);
          if (res.vendor.category) setCategory(res.vendor.category);
          setProfilePicUrl(res.vendor.profilePicUrl || '');
          setGoogleRating(res.googleRating || null);
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
    messagesCount: 0,
    unreadNotificationsCount: 0,
  });
  const [dismissedBadges, setDismissedBadges] = useState({});
  const [notifications, setNotifications] = useState([]);
  const badgeStorageKey = `starvnt.vendor.dismissedBadges.${
    user?.vendorOrganization?._id || user?._id || 'guest'
  }`;

  function saveDismissedBadges(next) {
    try {
      window.localStorage.setItem(badgeStorageKey, JSON.stringify(next));
    } catch {
      // Badges are cosmetic; ignore storage failures.
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(badgeStorageKey);
      setDismissedBadges(saved ? JSON.parse(saved) || {} : {});
    } catch {
      setDismissedBadges({});
    }
  }, [badgeStorageKey]);

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
          messagesCount: bRes.messagesCount || 0,
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

  useEffect(() => {
    const handleRefresh = () => fetchLiveBadges();
    window.addEventListener('vendorBadgesRefresh', handleRefresh);
    return () => window.removeEventListener('vendorBadgesRefresh', handleRefresh);
  }, []);

  useEffect(() => {
    if (['enquiries', 'quotes', 'bookings', 'messages'].includes(currentPage)) {
      dismissBadge(currentPage);
      markSectionNotificationsRead(currentPage);
    }
  }, [currentPage, badgeCounts, notifications]);

  function notificationBelongsToPage(notification, page) {
    const type = String(notification?.type || '').toUpperCase();
    const link = String(notification?.link || '');
    if (page === 'enquiries') return type === 'ENQUIRY' || link.startsWith('/vendor/enquiries');
    if (page === 'quotes') return link.startsWith('/vendor/quotes');
    if (page === 'bookings') {
      return ['BOOKING', 'PAYMENT'].includes(type) || link.startsWith('/vendor/bookings');
    }
    if (page === 'messages') return type === 'MESSAGE' || link.startsWith('/vendor/messages');
    return false;
  }

  async function markSectionNotificationsRead(page) {
    if (sectionReadInFlightRef.current.has(page)) return;
    const unread = notifications.filter((n) => !n.isRead && notificationBelongsToPage(n, page));
    if (!unread.length) return;

    sectionReadInFlightRef.current.add(page);
    try {
      await Promise.allSettled(
        unread.map((n) => externalApi.call(`/vendor/notifications/${n._id}/read`, { method: 'PUT' }))
      );
      setNotifications((prev) =>
        prev.map((n) => (unread.some((item) => item._id === n._id) ? { ...n, isRead: true } : n))
      );
      setBadgeCounts((prev) => {
        const decrement = unread.length;
        const next = {
          ...prev,
          unreadNotificationsCount: Math.max(0, prev.unreadNotificationsCount - decrement),
        };
        if (page === 'enquiries') next.enquiriesCount = 0;
        if (page === 'quotes') next.quotesCount = 0;
        if (page === 'bookings') next.bookingsCount = 0;
        if (page === 'messages') next.messagesCount = 0;
        return next;
      });
    } finally {
      sectionReadInFlightRef.current.delete(page);
    }
  }

  // Close header dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
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
    if (loggingOut) return;
    setLoggingOut(true);
    setProfileOpen(false);
    setNotifOpen(false);
    setNavOpen(false);
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  }

  function rawBadgeCount(page) {
    if (page === 'enquiries') return badgeCounts.enquiriesCount || 0;
    if (page === 'quotes') return badgeCounts.quotesCount || 0;
    if (page === 'bookings') return badgeCounts.bookingsCount || 0;
    if (page === 'messages') return badgeCounts.messagesCount || 0;
    return 0;
  }

  function dismissBadge(page) {
    setDismissedBadges((prev) => {
      const next = { ...prev, [page]: rawBadgeCount(page) };
      saveDismissedBadges(next);
      return next;
    });
  }

  function navBadge(page, count) {
    const dismissedCount = Number(dismissedBadges[page] || 0);
    if (!count || count <= dismissedCount) return null;
    return count - dismissedCount;
  }

  function handleNavClick(page) {
    setNavOpen(false);
    if (['enquiries', 'quotes', 'bookings', 'messages'].includes(page)) {
      dismissBadge(page);
    }
  }

  const navItems = [
    { to: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: 'enquiries', label: 'Enquiries', icon: 'message', badge: navBadge('enquiries', badgeCounts.enquiriesCount) },
    { to: 'quotes', label: 'Quotes', icon: 'quotes', badge: navBadge('quotes', badgeCounts.quotesCount) },
    { to: 'bookings', label: 'Bookings', icon: 'bookings', badge: navBadge('bookings', badgeCounts.bookingsCount) },
    { to: 'portfolio', label: 'Portfolio', icon: 'gallery' },
    { to: 'services', label: 'Services', icon: 'services' },
    { to: 'availability', label: 'Availability', icon: 'availability' },
    { to: 'payments', label: 'Payments', icon: 'payments' },
    { to: 'reviews', label: 'Reviews', icon: 'star' },
    { to: 'analytics', label: 'Analytics', icon: 'reports' },
    { to: 'messages', label: 'Messages', icon: 'message', badge: navBadge('messages', badgeCounts.messagesCount) },
    { to: 'profile', label: 'Profile & Hub', icon: 'profile' },
  ];

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-lavender">
      {navOpen && <div className="fixed inset-0 bg-navy/40 z-30 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static top-0 left-0 h-screen z-40 bg-white flex flex-col shrink-0 border-r border-gray-100 transition-all duration-300 ease-in-out ${isSidebarMini ? 'lg:w-20 w-64' : 'w-64'} ${navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
        <div className={`px-4 py-4 flex items-center ${isSidebarMini ? 'lg:justify-center' : 'justify-between'} border-b border-gray-100 lg:border-none relative h-[68px]`}>
          <div className={`${isSidebarMini ? 'lg:hidden' : 'block'}`}>
            <LogoWord sub="Vendor OS" />
          </div>
          {isSidebarMini && <div className="hidden lg:grid place-items-center shrink-0"><LogoMark size={34} /></div>}
          <button
            onClick={() => setNavOpen(false)}
            className="lg:hidden w-8 h-8 rounded-xl text-muted hover:bg-lavender grid place-items-center transition"
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
          
          <button 
            onClick={() => setIsSidebarMini(!isSidebarMini)}
            className={`hidden lg:grid w-6 h-6 rounded-full bg-white border border-gray-200 text-muted hover:text-navy hover:bg-gray-50 place-items-center transition absolute top-1/2 -translate-y-1/2 -right-3 z-50`}
            title="Toggle Sidebar"
          >
            <Icon name={isSidebarMini ? 'chevronRight' : 'chevronLeft'} size={14} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => handleNavClick(item.to)}
              title={isSidebarMini ? item.label : undefined}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13px] transition ${
                  isActive
                    ? 'bg-[#ede9fe] text-primary font-bold shadow-xs'
                    : 'text-ink/70 font-medium hover:bg-lavender hover:text-navy'
                } ${isSidebarMini ? 'lg:justify-center' : ''}`
              }
            >
              <Icon name={item.icon} size={17} className="shrink-0" />
              <span className={`flex-1 text-left ${isSidebarMini ? 'lg:hidden' : 'block'}`}>{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className={`min-w-[20px] h-5 rounded-full bg-[#e62e2e] text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-xs ${isSidebarMini ? 'lg:absolute lg:top-1 lg:right-1 lg:w-4 lg:h-4 lg:min-w-0 lg:text-[9px]' : 'w-5'}`}>
                  {isSidebarMini ? '' : item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Account + logout */}
        <div className={`p-4 border-t border-gray-100 flex items-center gap-2.5 ${isSidebarMini ? 'lg:flex-col lg:p-2' : ''}`}>
          {profilePicUrl || user?.avatarUrl ? (
            <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className={`rounded-full object-cover shrink-0 border border-gray-200 ${isSidebarMini ? 'lg:w-10 lg:h-10 w-9 h-9' : 'w-9 h-9'}`} />
          ) : (
            <div className={`rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0 ${isSidebarMini ? 'lg:w-10 lg:h-10 w-9 h-9' : 'w-9 h-9'}`}>
              {(businessName || user?.fullName || 'V')[0].toUpperCase()}
            </div>
          )}
          <div className={`flex-1 min-w-0 ${isSidebarMini ? 'lg:hidden' : 'block'}`}>
            <div className="text-xs font-bold truncate text-navy">{businessName || user?.fullName}</div>
            <div className="text-[10px] text-muted truncate">{category ? `Vendor · ${category}` : user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className={`h-9 grid place-items-center rounded-xl text-muted hover:text-red-500 hover:bg-red-50 transition shrink-0 disabled:opacity-60 ${isSidebarMini ? 'w-9 lg:w-full lg:mt-1' : 'px-3 gap-2 grid-flow-col'}`}
          >
            <Icon name="logout" size={16} />
            <span className={`text-xs font-bold ${isSidebarMini ? 'lg:hidden' : 'block'}`}>
              {loggingOut ? 'Signing out' : 'Logout'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-y-auto overflow-x-hidden pb-28 lg:pb-0 w-full">
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

          <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto shrink-0">
            {/* Aura+ assistant */}
            <button
              onClick={() => setAuraOpen((o) => !o)}
              className="hidden lg:flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-r from-primary to-[#9b6dff] text-white text-xs font-bold shadow-md shadow-primary/25 hover:opacity-95 transition shrink-0"
              title="Ask Aura+"
            >
              <Icon name="bolt" size={15} />
              Aura+
            </button>

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

            {/* Notification Bell with Dynamic Dot & Dedicated Relative Container */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender text-ink/60 transition cursor-pointer shrink-0"
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
            </div>

            {/* Profile Menu */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-full sm:rounded-xl transition select-none cursor-pointer"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
              >
                {profilePicUrl || user?.avatarUrl ? (
                  <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-xs" />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-xs sm:text-sm font-bold shadow-xs">
                    {(businessName || user?.fullName || 'VN').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold leading-tight truncate max-w-[150px]">{businessName || user?.fullName || 'Vendor'}</span>
                    {googleRating?.rating && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-extrabold shrink-0" title={`${googleRating.rating} / 5 (${googleRating.reviewCount || 0} reviews on Google Maps)`}>
                        <span className="text-amber-500 font-black">★</span>
                        <span>{googleRating.rating}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted truncate max-w-[150px]">Vendor • {category || 'Profile Incomplete'}</div>
                </div>
                <Icon name="chevronDown" size={14} className={`hidden sm:block text-muted transition ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-12 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 p-4 z-50 animate-[pop_.18s_ease-out]">
                  <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                    {profilePicUrl || user?.avatarUrl ? (
                      <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-12 h-12 rounded-2xl object-cover border border-gray-100" />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-sm font-extrabold">
                        {(businessName || user?.fullName || 'VN').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-navy truncate">{businessName || user?.fullName || 'Vendor'}</div>
                      <div className="text-[11px] text-muted truncate">{user?.email}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-primary">{category || 'Complete your profile'}</span>
                        {googleRating?.rating && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                            <span className="text-amber-500">★</span>
                            <span>{googleRating.rating}</span>
                            <span className="text-muted font-normal">({googleRating.reviewCount || 0})</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="py-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/vendor/profile');
                      }}
                      className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-ink hover:bg-lavender transition"
                    >
                      <Icon name="profile" size={17} />
                      Profile & Hub
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate('/vendor/settings');
                      }}
                      className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold text-ink hover:bg-lavender transition"
                    >
                      <Icon name="settings" size={17} />
                      Account Settings
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-extrabold text-red-600 hover:bg-red-100 transition disabled:opacity-60"
                  >
                    <Icon name="logout" size={17} />
                    {loggingOut ? 'Signing out...' : 'Logout'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Workspace Routes */}
        <div className="flex-1 min-h-0 w-full min-w-0">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardHome business={businessName} onAskAura={askAura} />} />
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
            <Route
              path="messages"
              element={
                <Messages
                  onMessagesRead={() => {
                    setBadgeCounts((prev) => ({ ...prev, messagesCount: 0 }));
                    setDismissedBadges((prev) => {
                      const next = { ...prev, messages: 0 };
                      saveDismissedBadges(next);
                      return next;
                    });
                  }}
                />
              }
            />
            <Route path="documents" element={<DocumentsPage user={user} business={businessName} />} />
            <Route path="profile" element={<ProfilePage user={user} business={businessName} />} />
            <Route path="settings" element={<SettingsPage user={user} business={businessName} />} />
          </Routes>
        </div>



        {/* Mobile Bottom Navigation Bar (Phone Screens) */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-2 pt-1.5 flex items-center justify-around shadow-lg"
          style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
        >
          <NavLink
            to="dashboard"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] font-bold transition ${
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
              `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="message" size={19} />
            <span>Leads</span>
            {navBadge('enquiries', badgeCounts.enquiriesCount) > 0 && (
              <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                {navBadge('enquiries', badgeCounts.enquiriesCount)}
              </span>
            )}
          </NavLink>

          <NavLink
            to="bookings"
            className={({ isActive }) =>
              `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="bookings" size={19} />
            <span>Bookings</span>
            {navBadge('bookings', badgeCounts.bookingsCount) > 0 && (
              <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                {navBadge('bookings', badgeCounts.bookingsCount)}
              </span>
            )}
          </NavLink>

          <NavLink
            to="calendar"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-primary' : 'text-muted hover:text-navy'
              }`
            }
          >
            <Icon name="calendar" size={19} />
            <span>Calendar</span>
          </NavLink>

          <button
            onClick={() => setNavOpen(true)}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl text-[10px] font-bold text-muted hover:text-navy transition"
          >
            <Icon name="menu" size={19} />
            <span>More</span>
          </button>
        </div>

        {/* Mobile Aura+ button, above the bottom navigation */}
        {!auraOpen && (
          <button
            onClick={() => setAuraOpen(true)}
            className="lg:hidden fixed right-4 bottom-20 z-30 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-lg shadow-primary/40 border-4 border-white"
            aria-label="Ask Aura+"
          >
            <Icon name="bolt" size={18} />
          </button>
        )}
      </div>

      <VendorAura open={auraOpen} onClose={() => setAuraOpen(false)} page={currentPage} userId={user?.id} prompt={auraPrompt} setup={setup} />
    </div>
  );
}
