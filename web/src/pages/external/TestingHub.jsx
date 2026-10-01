import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useExternalAuth } from "../../auth/ExternalAuthContext.jsx";
import { useAdminAuth } from "../../auth/AdminAuthContext.jsx";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { adminApi, externalApi } from "../../lib/api.js";
import { LogoWord } from "../../components/ui.jsx";
import Icon from "../../components/Icon.jsx";

const DEFAULT_PASSWORD = "Password123";

const TEST_ACCOUNTS = [
  {
    role: "VENDOR",
    category: "Photography",
    businessName: "Premium Moments Studio",
    ownerName: "Arun Roy",
    email: "vendor@starvnt.com",
    city: "Kolkata",
    rating: "4.9 ⭐",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
    icon: "camera",
  },
  {
    role: "VENDOR",
    category: "Catering",
    businessName: "Royal Feast & Banquets",
    ownerName: "Chef Sanjeev Verma",
    email: "catering@starvnt.com",
    city: "Delhi",
    rating: "4.8 ⭐",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    icon: "wallet",
  },
  {
    role: "VENDOR",
    category: "Decoration",
    businessName: "Flora & Grandeur Decor",
    ownerName: "Priya Sharma",
    email: "decor@starvnt.com",
    city: "Delhi",
    rating: "4.9 ⭐",
    badge: "bg-rose-100 text-rose-800 border-rose-200",
    icon: "star",
  },
  {
    role: "VENDOR",
    category: "Venue",
    businessName: "The Grand Heritage Palace",
    ownerName: "Raghav Singhania",
    email: "venue@starvnt.com",
    city: "Kolkata",
    rating: "5.0 ⭐",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: "mapPin",
  },
  {
    role: "VENDOR",
    category: "Sound & DJ",
    businessName: "Pulse Audio & Stage FX",
    ownerName: "Kabir Malhotra",
    email: "dj@starvnt.com",
    city: "Mumbai",
    rating: "4.8 ⭐",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    icon: "trend",
  },
  {
    role: "VENDOR",
    category: "Makeup",
    businessName: "Glamour Glow Bridal Artistry",
    ownerName: "Natasha Mehra",
    email: "makeup@starvnt.com",
    city: "Delhi",
    rating: "4.9 ⭐",
    badge: "bg-pink-100 text-pink-800 border-pink-200",
    icon: "star",
  },
  {
    role: "VENDOR",
    category: "Live Band",
    businessName: "Sufi & Strings Live Ensemble",
    ownerName: "Aftab Hussain",
    email: "liveband@starvnt.com",
    city: "Delhi",
    rating: "4.9 ⭐",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
    icon: "mic",
  },
  {
    role: "VENDOR",
    category: "Event Planning",
    businessName: "Elite Vows Event Planning",
    ownerName: "Tanya & Rohan Mehta",
    email: "planner@starvnt.com",
    city: "Mumbai",
    rating: "5.0 ⭐",
    badge: "bg-teal-100 text-teal-800 border-teal-200",
    icon: "calendar",
  },
  {
    role: "CUSTOMER",
    category: "Customer Host",
    businessName: "Ananya Roy",
    ownerName: "Wedding Host",
    email: "customer@starvnt.com",
    city: "Delhi / Kolkata",
    rating: "Active Host",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: "customers",
  },
  {
    role: "ADMIN",
    category: "Super Admin",
    businessName: "Chief Systems Architect",
    ownerName: "Platform Admin",
    email: "admin@starvnt.com",
    city: "Command Center",
    rating: "Full RBAC",
    badge: "bg-slate-900 text-amber-300 border-slate-700",
    icon: "shieldCheck",
  },
];

const PRESET_ENDPOINTS = [
  { label: "Health Check", method: "GET", path: "/api/health", domain: "EXTERNAL" },
  { label: "Demo Accounts List", method: "GET", path: "/api/auth/demo-accounts", domain: "EXTERNAL" },
  { label: "Vendor Profile & Google Rating", method: "GET", path: "/api/vendor/profile", domain: "EXTERNAL" },
  { label: "Vendor Services & Packages", method: "GET", path: "/api/vendor/services", domain: "EXTERNAL" },
  { label: "Vendor Bookings", method: "GET", path: "/api/vendor/bookings", domain: "EXTERNAL" },
  { label: "Vendor Quotes", method: "GET", path: "/api/vendor/quotes", domain: "EXTERNAL" },
  { label: "Vendor Reviews & Ratings", method: "GET", path: "/api/vendor/reviews", domain: "EXTERNAL" },
  { label: "Vendor Enquiries", method: "GET", path: "/api/vendor/enquiries", domain: "EXTERNAL" },
  { label: "Vendor Notifications", method: "GET", path: "/api/vendor/notifications", domain: "EXTERNAL" },
  { label: "Google Place Search (Kolkata)", method: "GET", path: "/api/vendor/google-places/search?q=kolkata", domain: "EXTERNAL" },
  { label: "Customer Events", method: "GET", path: "/api/customer/events", domain: "EXTERNAL" },
  { label: "Customer Catalog (Services)", method: "GET", path: "/api/customer/catalog", domain: "EXTERNAL" },
  { label: "Customer Updates & Threads", method: "GET", path: "/api/customer/circle/updates", domain: "EXTERNAL" },
  { label: "Customer Me Profile", method: "GET", path: "/api/customer/me", domain: "EXTERNAL" },
  { label: "Admin Users List", method: "GET", path: "/api/admin/external-users", domain: "ADMIN" },
  { label: "Admin Events List", method: "GET", path: "/api/admin/events", domain: "ADMIN" },
];

export default function TestingHub() {
  const { user, login, logout: externalLogout } = useExternalAuth();
  const { admin, login: adminLogin, logout: adminLogout } = useAdminAuth() || {};
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  // State
  const [switchingEmail, setSwitchingEmail] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // API Tester State
  const [testPath, setTestPath] = useState("/api/vendor/profile");
  const [testMethod, setTestMethod] = useState("GET");
  const [testBody, setTestBody] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testingBusy, setTestingBusy] = useState(false);

  // Reseed State
  const [reseedBusy, setReseedBusy] = useState(false);

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Switch persona live
  const handleSwitch = async (acc, redirect = false) => {
    setSwitchingEmail(acc.email);
    setFeedbackMsg(null);
    try {
      if (acc.role === "ADMIN") {
        if (adminLogin) {
          await adminLogin(acc.email, DEFAULT_PASSWORD);
        } else {
          const res = await adminApi.call("/auth/login", {
            method: "POST",
            body: { email: acc.email, password: DEFAULT_PASSWORD },
          });
          if (res?.accessToken) adminApi.setToken(res.accessToken);
        }
        setFeedbackMsg({ type: "success", text: `Logged in as Super Admin (${acc.email})!` });
        if (redirect) navigate("/admin");
      } else {
        await login(acc.email, DEFAULT_PASSWORD, acc.role);
        setFeedbackMsg({
          type: "success",
          text: `Switched session to ${acc.businessName} (${acc.role})!`,
        });
        if (redirect) {
          navigate(acc.role === "VENDOR" ? "/vendor" : "/customer");
        }
      }
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Login failed for ${acc.email}: ${err.data?.error || err.message || "Unknown error"}`,
      });
    } finally {
      setSwitchingEmail(null);
    }
  };

  const handleGlobalLogout = async () => {
    try {
      if (externalLogout) await externalLogout();
      if (adminLogout) await adminLogout();
      externalApi.setToken(null);
      adminApi.setToken(null);
      setFeedbackMsg({ type: "success", text: "Successfully logged out from all sessions." });
    } catch {
      externalApi.setToken(null);
      adminApi.setToken(null);
    }
  };

  // Run live API endpoint test
  const runApiTest = async (overridePath, overrideMethod) => {
    const path = overridePath || testPath;
    const method = overrideMethod || testMethod;
    setTestingBusy(true);
    setTestResult(null);

    const startTime = performance.now();
    try {
      let res;
      let bodyData;
      if (method !== "GET" && testBody.trim()) {
        try {
          bodyData = JSON.parse(testBody);
        } catch {
          bodyData = testBody;
        }
      }

      if (path.startsWith("/api/admin")) {
        const adminPath = path.replace("/api/admin", "");
        res = await adminApi.raw(adminPath, { method, body: bodyData });
      } else {
        const extPath = path.replace("/api", "");
        res = await externalApi.raw(extPath, { method, body: bodyData });
      }

      const elapsed = Math.round(performance.now() - startTime);
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : await res.text();

      setTestResult({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        timeMs: elapsed,
        data,
      });
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      setTestResult({
        ok: false,
        status: 0,
        statusText: "Network / Fetch Error",
        timeMs: elapsed,
        error: err.message,
      });
    } finally {
      setTestingBusy(false);
    }
  };

  // Reseed Trigger
  const triggerReseed = async () => {
    setReseedBusy(true);
    setFeedbackMsg(null);
    try {
      const res = await externalApi.call("/auth/reseed", { method: "POST" });
      setFeedbackMsg({
        type: "success",
        text: `✓ ${res?.message || "Real vendors re-seeded successfully in database!"}`,
      });
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Reseed failed: ${err.message}. You can also run 'npm run seed:vendors' in terminal.`,
      });
    } finally {
      setReseedBusy(false);
    }
  };

  const activeIdentity = user
    ? {
        name: user.fullName || "User",
        type: user.accountType || "EXTERNAL",
        email: user.email,
        route: user.accountType === "VENDOR" ? "/vendor" : "/customer",
        details: user.accountType === "VENDOR" ? "Vendor Organization active" : "Customer account",
      }
    : admin
      ? {
          name: admin.fullName || "Admin",
          type: "ADMIN (Super Admin)",
          email: admin.email,
          route: "/admin",
          details: "Platform Command Center Access",
        }
      : null;

  return (
    <div className={`min-h-screen ${dark ? "bg-slate-950 text-white" : "bg-[#f5f7fb] text-slate-800"}`}>
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <LogoWord />
            </Link>
            <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              🧪 QA & Testing Control Center
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-muted grid place-items-center hover:bg-gray-50 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <Icon name={dark ? "sun" : "moon"} size={16} />
            </button>
            <Link
              to="/test-login"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-navy dark:text-white bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
            >
              Test Login Cards →
            </Link>
            <Link
              to="/login"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-navy text-white hover:bg-navy/90 transition shadow-xs"
            >
              Standard Login
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Banner with Active Session Inspector */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/90 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-muted uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Current Session Inspector</span>
            </div>
            {activeIdentity ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl sm:text-2xl font-extrabold text-navy dark:text-white">
                  {activeIdentity.name}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  {activeIdentity.type}
                </span>
                <span className="text-xs text-muted font-mono bg-gray-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {activeIdentity.email}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xl font-extrabold text-slate-400">
                  Guest Mode (No active session)
                </span>
                <span className="text-xs text-muted">
                  Choose a persona below to sign in instantly
                </span>
              </div>
            )}
          </div>

          {/* Session Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {activeIdentity ? (
              <>
                <Link
                  to={activeIdentity.route}
                  className="flex-1 lg:flex-none px-4 py-2 text-xs font-bold rounded-xl bg-primary hover:bg-[#4335d6] text-white shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Open {activeIdentity.type} View</span>
                  <Icon name="chevronRight" size={14} />
                </Link>
                <button
                  onClick={handleGlobalLogout}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Icon name="logout" size={14} />
                  <span>Logout</span>
                </button>
              </>
            ) : null}

            <button
              disabled={reseedBusy}
              onClick={triggerReseed}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-gray-100 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              title="Reseed 8 Real Vendors in Database"
            >
              <Icon name="trend" size={14} className={reseedBusy ? "animate-spin" : ""} />
              <span>{reseedBusy ? "Reseeding…" : "Reseed DB"}</span>
            </button>

            <button
              onClick={() => copyText(DEFAULT_PASSWORD, "banner_pw")}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name={copiedKey === "banner_pw" ? "check" : "link"} size={14} />
              <span>{copiedKey === "banner_pw" ? "Copied!" : "Pass: Password123"}</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-medium flex items-center justify-between gap-3 ${
              feedbackMsg.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              onClick={() => setFeedbackMsg(null)}
              className="font-bold underline text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* SECTION 1: 1-Click Persona Switcher Grid */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/90 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-navy dark:text-white flex items-center gap-2">
                <span>🎭 1-Click Persona Switcher</span>
              </h2>
              <p className="text-xs text-muted">
                Switch identity in one click. “Switch & Stay” updates session for API testing; “Switch & Go” opens the app view.
              </p>
            </div>
            <span className="text-[11px] text-muted font-medium">
              Password for all: <strong>{DEFAULT_PASSWORD}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {TEST_ACCOUNTS.map((acc) => {
              const isCurrent = (user && user.email === acc.email) || (admin && admin.email === acc.email);
              const isSwitching = switchingEmail === acc.email;

              return (
                <div
                  key={acc.email}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isCurrent
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-xs"
                      : "border-gray-200 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${acc.badge}`}
                      >
                        {acc.category}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <h4 className="font-extrabold text-navy dark:text-white text-xs leading-snug line-clamp-1">
                      {acc.businessName}
                    </h4>
                    <p className="text-[11px] text-muted leading-tight">
                      {acc.ownerName} · {acc.city}
                    </p>
                    <code className="block font-mono text-[10px] text-slate-500 truncate">
                      {acc.email}
                    </code>
                  </div>

                  <div className="pt-3 flex items-center gap-1.5">
                    <button
                      disabled={Boolean(switchingEmail)}
                      onClick={() => handleSwitch(acc, false)}
                      className="flex-1 py-1.5 px-2 text-[10px] font-bold rounded-lg bg-navy hover:bg-navy/90 text-white transition disabled:opacity-50 cursor-pointer"
                      title="Switch active session here"
                    >
                      {isSwitching ? "…" : "Switch"}
                    </button>
                    <button
                      disabled={Boolean(switchingEmail)}
                      onClick={() => handleSwitch(acc, true)}
                      className="py-1.5 px-2.5 text-[10px] font-bold rounded-lg bg-primary hover:bg-[#4335d6] text-white transition disabled:opacity-50 cursor-pointer"
                      title="Switch and Navigate directly"
                    >
                      Go →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 2: Live API Endpoint Tester */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/90 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-navy dark:text-white flex items-center gap-2">
                <span>⚡ Live API Endpoint Tester</span>
              </h2>
              <p className="text-xs text-muted">
                Execute authenticated HTTP requests against the backend using your currently active session.
              </p>
            </div>
            {testResult && (
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  testResult.ok
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                Status: {testResult.status} {testResult.statusText} ({testResult.timeMs} ms)
              </span>
            )}
          </div>

          {/* Quick Preset Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
              Quick Test Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ENDPOINTS.map((ep) => (
                <button
                  key={ep.path}
                  onClick={() => {
                    setTestPath(ep.path);
                    setTestMethod(ep.method);
                    runApiTest(ep.path, ep.method);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-xl font-medium border transition cursor-pointer ${
                    testPath === ep.path
                      ? "bg-primary text-white border-primary font-bold shadow-xs"
                      : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-gray-100"
                  }`}
                >
                  <span className="font-bold text-[10px] mr-1 opacity-70">{ep.method}</span>
                  {ep.label}
                </button>
              ))}
            </div>
          </div>

          {/* Request Input Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
            <select
              value={testMethod}
              onChange={(e) => setTestMethod(e.target.value)}
              className="py-2 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-navy dark:text-white"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </select>
            <input
              type="text"
              value={testPath}
              onChange={(e) => setTestPath(e.target.value)}
              placeholder="/api/vendor/profile"
              className="flex-1 px-3.5 py-2 text-xs font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20"
            />
            <button
              disabled={testingBusy}
              onClick={() => runApiTest()}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-navy hover:bg-navy/90 text-white transition disabled:opacity-60 cursor-pointer shadow-sm"
            >
              {testingBusy ? "Running…" : "Send Request →"}
            </button>
          </div>

          {/* Response Payload Viewer */}
          {testResult && (
            <div className="mt-3 p-4 rounded-2xl bg-slate-950 text-slate-100 font-mono text-xs border border-slate-800 space-y-2 overflow-hidden">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span>
                  Response Payload · {testResult.timeMs}ms
                </span>
                <button
                  onClick={() =>
                    copyText(
                      JSON.stringify(testResult.data || testResult.error, null, 2),
                      "api_res"
                    )
                  }
                  className="hover:text-white transition cursor-pointer flex items-center gap-1"
                >
                  <Icon name={copiedKey === "api_res" ? "check" : "link"} size={12} />
                  <span>{copiedKey === "api_res" ? "Copied!" : "Copy JSON"}</span>
                </button>
              </div>
              <pre className="max-h-72 overflow-auto text-[11px] leading-relaxed text-emerald-400">
                {JSON.stringify(testResult.data || testResult.error, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* SECTION 3: Direct App Pages Navigation Matrix */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-gray-200/90 dark:border-slate-800 shadow-sm space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-navy dark:text-white flex items-center gap-2">
              <span>🗺️ Direct Application Pages Matrix</span>
            </h2>
            <p className="text-xs text-muted">
              Deep-link directly to any core view across Customer, Vendor OS, and Admin domains.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Vendor OS Column */}
            <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-xs text-purple-900 dark:text-purple-300 uppercase tracking-wider">
                  🏢 Vendor OS Views
                </h3>
                <span className="text-[10px] text-purple-700 font-bold bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded-full">
                  10 Pages
                </span>
              </div>
              <div className="space-y-1">
                {[
                  { label: "Vendor Dashboard", path: "/vendor" },
                  { label: "Profile & Google Map/Place", path: "/vendor/profile?tab=profile" },
                  { label: "Reviews & Ratings Tab", path: "/vendor/profile?tab=reviews" },
                  { label: "Services & Pricing Packages", path: "/vendor/services" },
                  { label: "Bookings Execution", path: "/vendor/bookings" },
                  { label: "Quote Builder", path: "/vendor/quotes" },
                  { label: "Client Enquiries", path: "/vendor/enquiries" },
                  { label: "Portfolio Media & Reels", path: "/vendor/portfolio" },
                  { label: "Calendar & Availability", path: "/vendor/calendar" },
                  { label: "Vendor Aura AI Studio", path: "/vendor/aura" },
                ].map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs transition"
                  >
                    <span>{item.label}</span>
                    <span className="text-[11px] text-muted font-mono">{item.path.split("?")[0]} →</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Customer App Column */}
            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-xs text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                  🎉 Customer App Views
                </h3>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                  6 Pages
                </span>
              </div>
              <div className="space-y-1">
                {[
                  { label: "Customer Home", path: "/customer" },
                  { label: "My Events Hub", path: "/customer/events" },
                  { label: "Services & Vendors Catalog", path: "/customer/services" },
                  { label: "Updates & Messages (Circle)", path: "/customer/updates" },
                  { label: "Aura+ AI Event Planner", path: "/customer/aura" },
                  { label: "Customer Me / Settings", path: "/customer/me" },
                ].map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs transition"
                  >
                    <span>{item.label}</span>
                    <span className="text-[11px] text-muted font-mono">{item.path} →</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Admin & Auth Column */}
            <div className="p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-300 uppercase tracking-wider">
                  🛡️ Admin & Auth Portals
                </h3>
                <span className="text-[10px] text-slate-700 dark:text-slate-300 font-bold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                  6 Pages
                </span>
              </div>
              <div className="space-y-1">
                {[
                  { label: "Admin Command Center", path: "/admin" },
                  { label: "Users & RBAC Management", path: "/admin/users" },
                  { label: "Core Bookings & Escrow", path: "/admin/bookings" },
                  { label: "Security Audit Logs", path: "/admin/audit" },
                  { label: "Test Accounts Grid", path: "/test-login" },
                  { label: "Unified External Login", path: "/login" },
                  { label: "Internal Admin Login", path: "/admin/login" },
                  { label: "Public Landing Page", path: "/" },
                ].map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs transition"
                  >
                    <span>{item.label}</span>
                    <span className="text-[11px] text-muted font-mono">{item.path} →</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
