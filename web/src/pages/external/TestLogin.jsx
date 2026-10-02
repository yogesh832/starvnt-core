import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useExternalAuth } from "../../auth/ExternalAuthContext.jsx";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { adminApi, externalApi } from "../../lib/api.js";
import { LogoWord } from "../../components/ui.jsx";
import Icon from "../../components/Icon.jsx";

const DEFAULT_PASSWORD = "Password123";

const FALLBACK_ACCOUNTS = [
  {
    id: "admin_1",
    fullName: "Chief Systems Architect",
    email: "admin@starvnt.com",
    role: "SUPER_ADMIN",
    type: "ADMIN",
    category: "Platform Core",
    businessName: "STARVNT Master Admin",
    location: "Global Command Center",
    rating: { average: 5.0, count: 999 },
    profilePicUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    bio: "Super Admin with authoritative access over Core Escrow, Multi-tenant RBAC, Audit Logs, and Global Event States.",
  },
  {
    id: "cust_1",
    fullName: "Ananya Roy",
    email: "customer@starvnt.com",
    phone: "+91 98300 12345",
    type: "CUSTOMER",
    category: "Event Host",
    businessName: "Ananya Roy (Wedding Host)",
    location: "Kolkata / Delhi",
    rating: { average: 5.0, count: 1 },
    profilePicUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
    bio: "Active customer planning high-end wedding celebrations with live Aura+ sessions, verified quotes, and escrow bookings.",
  },
  {
    id: "vend_1",
    fullName: "Arun Roy",
    email: "vendor@starvnt.com",
    phone: "+91 98765 43210",
    type: "VENDOR",
    category: "Photography",
    businessName: "Premium Moments Studio",
    location: "Salt Lake, Kolkata, West Bengal",
    rating: { average: 4.9, count: 142 },
    profilePicUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    bio: "Award-winning wedding & cinematic film studio capturing timeless love stories across India.",
    tags: ["Cinematic 4K", "Drone Teaser", "Candid Moments"],
  },
  {
    id: "vend_2",
    fullName: "Chef Sanjeev Verma",
    email: "catering@starvnt.com",
    phone: "+91 98111 23456",
    type: "VENDOR",
    category: "Catering",
    businessName: "Royal Feast & Banquets Catering",
    location: "Connaught Place, Delhi",
    rating: { average: 4.8, count: 215 },
    profilePicUrl: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=80",
    bio: "Culinary excellence for high-profile weddings and corporate galas. Featuring live artisanal counters and Awadhi dum pukht.",
    tags: ["Live Chaat", "Mughlai Buffet", "Pan-Asian Bar"],
  },
  {
    id: "vend_3",
    fullName: "Priya Sharma",
    email: "decor@starvnt.com",
    phone: "+91 98222 34567",
    type: "VENDOR",
    category: "Decoration",
    businessName: "Flora & Grandeur Event Decor",
    location: "Aerocity, Delhi",
    rating: { average: 4.9, count: 188 },
    profilePicUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    bio: "Bespoke floral installations, fairytale mandaps, thematic corporate galas, and luxury ambient stage styling.",
    tags: ["Floral Mandap", "Fairy Light Canopy", "3D Renders"],
  },
  {
    id: "vend_4",
    fullName: "Raghav Singhania",
    email: "venue@starvnt.com",
    phone: "+91 98333 45678",
    type: "VENDOR",
    category: "Venue",
    businessName: "The Grand Heritage Palace & Lawns",
    location: "New Town, Kolkata, West Bengal",
    rating: { average: 5.0, count: 320 },
    profilePicUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80",
    bio: "Palatial 25,000 sq.ft banquet ballroom with manicured open lawns, 4 luxury bridal suites, and valet parking for 1,200+ guests.",
    tags: ["800 Pax Ballroom", "Lush Lawn", "Bridal Suites"],
  },
  {
    id: "vend_5",
    fullName: "Kabir Malhotra",
    email: "dj@starvnt.com",
    phone: "+91 98444 56789",
    type: "VENDOR",
    category: "Sound",
    businessName: "Pulse Audio & Stage FX",
    location: "Bandra West, Mumbai, Maharashtra",
    rating: { average: 4.8, count: 164 },
    profilePicUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
    bio: "Concert-grade JBL Line Arrays, intelligent laser lighting, club and Bollywood wedding DJs with cold pyros and FX.",
    tags: ["JBL Line Array", "Laser Show", "Celebrity DJ"],
  },
  {
    id: "vend_6",
    fullName: "Natasha Mehra",
    email: "makeup@starvnt.com",
    phone: "+91 98555 67890",
    type: "VENDOR",
    category: "Makeup",
    businessName: "Glamour Glow Bridal Artistry",
    location: "Greater Kailash, Delhi",
    rating: { average: 4.9, count: 128 },
    profilePicUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
    bio: "HD Airbrush and international bridal artistry, luxury pre-bridal skin therapy, and high-fashion hair styling.",
    tags: ["Temptu HD Airbrush", "Bridal Draping", "Dyson Hair Couture"],
  },
  {
    id: "vend_7",
    fullName: "Aftab Hussain",
    email: "liveband@starvnt.com",
    phone: "+91 98666 78901",
    type: "VENDOR",
    category: "Entertainment",
    businessName: "Sufi & Strings Live Ensemble",
    location: "Hauz Khas, Delhi",
    rating: { average: 4.9, count: 96 },
    profilePicUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    bio: "Soulful Sufi-rock, Bollywood acoustic mashups, and live orchestral fusion for sangeets and cocktail soirees.",
    tags: ["6-Piece Live Band", "Sufi Rock", "Bollywood Acoustic"],
  },
  {
    id: "vend_8",
    fullName: "Tanya & Rohan Mehta",
    email: "planner@starvnt.com",
    phone: "+91 98777 89012",
    type: "VENDOR",
    category: "Event Planning",
    businessName: "Elite Vows Event Planning & Production",
    location: "Juhu, Mumbai, Maharashtra",
    rating: { average: 5.0, count: 175 },
    profilePicUrl: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80",
    bio: "End-to-end luxury wedding curation, vendor synchronisation, RSVP management, and seamless day-of execution.",
    tags: ["Destination Wedding", "VIP RSVP Concierge", "Full Production"],
  },
];

const CATEGORY_COLORS = {
  Photography: "bg-purple-50 text-purple-700 border-purple-200",
  Catering: "bg-amber-50 text-amber-700 border-amber-200",
  Decoration: "bg-rose-50 text-rose-700 border-rose-200",
  Venue: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Sound: "bg-blue-50 text-blue-700 border-blue-200",
  Makeup: "bg-pink-50 text-pink-700 border-pink-200",
  Entertainment: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Event Planning": "bg-teal-50 text-teal-700 border-teal-200",
  "Event Host": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Platform Core": "bg-slate-900 text-amber-300 border-slate-700",
};

export default function TestLogin() {
  const { login } = useExternalAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState(FALLBACK_ACCOUNTS);
  const [roleFilter, setRoleFilter] = useState("ALL"); // ALL | VENDOR | CUSTOMER | ADMIN
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Load dynamically from backend if available
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await externalApi.call("/auth/demo-accounts");
        if (res && res.ok) {
          const list = [];
          if (res.admin) {
            list.push({
              ...res.admin,
              category: "Platform Core",
              businessName: "STARVNT Master Admin",
              location: "Global Command Center",
              rating: { average: 5.0, count: 999 },
              bio: "Super Admin with authoritative access over Core Escrow, Multi-tenant RBAC, and Event States.",
            });
          }
          if (res.customers?.length) {
            res.customers.forEach((c) => {
              list.push({
                ...c,
                category: "Event Host",
                businessName: `${c.fullName} (Event Host)`,
                location: "Kolkata / Delhi",
                rating: { average: 5.0, count: 1 },
                bio: "Active customer planning high-end wedding celebrations with live Aura+ sessions and bookings.",
              });
            });
          }
          if (res.vendors?.length) {
            list.push(...res.vendors);
          }
          if (list.length > 0) {
            setAccounts(list);
          }
        }
      } catch {
        // Fallback accounts will be used
      }
    }
    fetchAccounts();
  }, []);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleOneClickLogin = async (acc) => {
    setErrorMsg("");
    setLoadingEmail(acc.email);
    try {
      if (acc.type === "ADMIN") {
        const data = await adminApi.call("/auth/login", {
          method: "POST",
          body: { email: acc.email, password: DEFAULT_PASSWORD },
        });
        if (data?.accessToken) {
          adminApi.setToken(data.accessToken);
        }
        navigate("/admin", { replace: true });
        return;
      }

      // External user: Customer or Vendor
      await login(acc.email, DEFAULT_PASSWORD, acc.type);
      if (acc.type === "VENDOR") {
        navigate("/vendor", { replace: true });
      } else {
        navigate("/customer", { replace: true });
      }
    } catch (err) {
      console.error("[TestLogin] Login failed:", err);
      setErrorMsg(
        err.data?.error || err.message || "Failed to log in with demo account. Ensure password is Password123."
      );
    } finally {
      setLoadingEmail(null);
    }
  };

  const categories = [
    "ALL",
    ...new Set(accounts.filter((a) => a.type === "VENDOR").map((a) => a.category).filter(Boolean)),
  ];

  const filteredAccounts = accounts.filter((acc) => {
    if (roleFilter !== "ALL" && acc.type !== roleFilter) return false;
    if (categoryFilter !== "ALL" && acc.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = acc.fullName?.toLowerCase().includes(q);
      const matchBiz = acc.businessName?.toLowerCase().includes(q);
      const matchCat = acc.category?.toLowerCase().includes(q);
      const matchEmail = acc.email?.toLowerCase().includes(q);
      const matchLoc = acc.location?.toLowerCase().includes(q);
      if (!matchName && !matchBiz && !matchCat && !matchEmail && !matchLoc) return false;
    }
    return true;
  });

  return (
    <div className={`min-h-screen ${dark ? "bg-slate-950 text-white" : "bg-[#f6f8fc] text-slate-800"}`}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/80 dark:border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <LogoWord />
            </Link>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
              Demo & QA Test Login
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-muted grid place-items-center hover:bg-gray-50 dark:hover:bg-slate-700 transition cursor-pointer"
              title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <Icon name={dark ? "sun" : "moon"} size={16} />
            </button>
            <Link
              to="/test"
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs flex items-center gap-1.5"
            >
              <span>⚡ QA Control Center (/test) →</span>
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-navy dark:text-white bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
            >
              Standard Login
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Master Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4338ca] text-white p-6 sm:p-8 shadow-xl mb-8">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-bold text-amber-300 border border-white/10 mb-3">
                <span>⚡ Instant One-Click Authentication</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Seeded Accounts & Quick Test Login
              </h1>
              <p className="mt-2 text-sm text-indigo-100/90 leading-relaxed">
                Click <strong>“1-Click Login”</strong> on any profile below to sign in instantly. Real vendors have verified profiles, operating locations, services, ratings, and portfolio media ready to test.
              </p>
            </div>

            {/* Universal Password Pill */}
            <div className="bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/20 flex flex-col gap-2 shrink-0">
              <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-200">
                Shared Master Password:
              </span>
              <div className="flex items-center gap-3">
                <code className="text-lg sm:text-xl font-mono font-bold tracking-wider px-3 py-1.5 bg-black/30 rounded-xl border border-white/10 text-emerald-300">
                  {DEFAULT_PASSWORD}
                </code>
                <button
                  onClick={() => copyToClipboard(DEFAULT_PASSWORD, "master_pw")}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-white text-navy hover:bg-indigo-50 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  title="Copy Master Password"
                >
                  {copiedKey === "master_pw" ? (
                    <>
                      <Icon name="check" size={14} className="text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Icon name="link" size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <span className="text-[10px] text-white/70">
                Works for all 8 Vendors, Customer & Admin
              </span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} className="font-bold text-xs underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-slate-800 shadow-xs mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Role Filter Tabs */}
            <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold overflow-x-auto">
              {[
                { key: "ALL", label: `All Accounts (${accounts.length})` },
                {
                  key: "VENDOR",
                  label: `Vendors (${accounts.filter((a) => a.type === "VENDOR").length})`,
                },
                {
                  key: "CUSTOMER",
                  label: `Customer (${accounts.filter((a) => a.type === "CUSTOMER").length})`,
                },
                {
                  key: "ADMIN",
                  label: `Admin (${accounts.filter((a) => a.type === "ADMIN").length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setRoleFilter(tab.key);
                    if (tab.key !== "VENDOR") setCategoryFilter("ALL");
                  }}
                  className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
                    roleFilter === tab.key
                      ? "bg-navy text-white shadow-xs"
                      : "text-muted hover:text-navy dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor, category, city, email…"
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20"
              />
              <div className="absolute left-3 top-2.5 text-muted pointer-events-none">
                <Icon name="search" size={14} />
              </div>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2.5 text-xs text-muted hover:text-navy cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills (when Vendor or All is active) */}
          {(roleFilter === "ALL" || roleFilter === "VENDOR") && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-gray-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-muted mr-1 shrink-0">Category:</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition cursor-pointer ${
                    categoryFilter === cat
                      ? "bg-primary text-white shadow-xs font-bold"
                      : "bg-gray-100 dark:bg-slate-800 text-muted hover:text-navy dark:hover:text-white"
                  }`}
                >
                  {cat === "ALL" ? "All Categories" : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results Counter */}
        <div className="mb-4 flex items-center justify-between text-xs text-muted px-1">
          <span>
            Showing <strong>{filteredAccounts.length}</strong> available test accounts
          </span>
          <span>Click any 1-Click Login button to sign in directly</span>
        </div>

        {/* Account Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAccounts.map((acc) => {
            const isLoading = loadingEmail === acc.email;
            const badgeClass =
              CATEGORY_COLORS[acc.category] || "bg-gray-50 text-gray-700 border-gray-200";

            return (
              <div
                key={acc.id || acc.email}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                {/* Card Top */}
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={acc.profilePicUrl}
                        alt={acc.fullName}
                        className="w-12 h-12 rounded-2xl object-cover border border-gray-200 dark:border-slate-700 shrink-0"
                        onError={(e) => {
                          e.target.src =
                            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80";
                        }}
                      />
                      <div>
                        <h3 className="font-extrabold text-navy dark:text-white text-base leading-snug">
                          {acc.businessName || acc.fullName}
                        </h3>
                        <p className="text-xs text-muted font-medium mt-0.5">
                          {acc.fullName} {acc.type === "VENDOR" ? "· Owner" : ""}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border shrink-0 ${badgeClass}`}
                    >
                      {acc.category}
                    </span>
                  </div>

                  {/* Location & Rating */}
                  <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted">
                    {acc.location && (
                      <span className="flex items-center gap-1 font-medium">
                        <Icon name="mapPin" size={13} className="text-primary" />
                        {acc.location.split(",")[0]}
                      </span>
                    )}
                    {acc.rating?.average && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                        ⭐ {acc.rating.average}
                        <span className="text-muted font-normal">({acc.rating.count})</span>
                      </span>
                    )}
                    {acc.type === "VENDOR" && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        ✓ Verified Partner
                      </span>
                    )}
                  </div>

                  {/* Bio */}
                  {acc.bio && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {acc.bio}
                    </p>
                  )}

                  {/* Feature Tags */}
                  {acc.tags && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {acc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Credentials Box */}
                  <div className="p-3 rounded-2xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-800 space-y-2 text-xs">
                    {/* Email Row */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-[11px] font-medium">Email:</span>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-navy dark:text-white font-semibold text-xs">
                          {acc.email}
                        </code>
                        <button
                          onClick={() => copyToClipboard(acc.email, `email_${acc.email}`)}
                          className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 text-muted transition cursor-pointer"
                          title="Copy Email"
                        >
                          {copiedKey === `email_${acc.email}` ? (
                            <Icon name="check" size={12} className="text-emerald-600" />
                          ) : (
                            <Icon name="link" size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Password Row */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-[11px] font-medium">Password:</span>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                          {DEFAULT_PASSWORD}
                        </code>
                        <button
                          onClick={() => copyToClipboard(DEFAULT_PASSWORD, `pw_${acc.email}`)}
                          className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 text-muted transition cursor-pointer"
                          title="Copy Password"
                        >
                          {copiedKey === `pw_${acc.email}` ? (
                            <Icon name="check" size={12} className="text-emerald-600" />
                          ) : (
                            <Icon name="link" size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="p-4 sm:p-5 pt-0">
                  <button
                    disabled={Boolean(loadingEmail)}
                    onClick={() => handleOneClickLogin(acc)}
                    className={`w-full py-2.5 px-4 rounded-2xl text-xs font-bold text-white transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                      acc.type === "ADMIN"
                        ? "bg-slate-900 hover:bg-black"
                        : acc.type === "CUSTOMER"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-primary hover:bg-[#4335d6]"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Signing In…</span>
                      </>
                    ) : (
                      <>
                        <span>🚀 1-Click Login as {acc.type === "ADMIN" ? "Admin" : acc.type === "CUSTOMER" ? "Customer" : "Vendor"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
