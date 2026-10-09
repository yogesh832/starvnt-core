import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { LogoWord } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';

/**
 * STARVNT Core Platform Admin Login:
 * Full-screen responsive layout with dark mode support across the entire viewport.
 * Credentials: admin@starvnt.com / Password123
 */
export default function AdminLogin() {
  const { login } = useAdminAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function fillDemo() {
    setForm({ email: 'admin@starvnt.com', password: 'Password123' });
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate('/admin', { replace: true });
    } catch (err) {
      const map = {
        INVALID_CREDENTIALS: 'Incorrect email or password. Use: admin@starvnt.com / Password123',
        ACCOUNT_DISABLED: 'This admin account has been disabled.',
        RATE_LIMITED: 'Too many attempts — wait a few minutes and retry.',
      };
      setError(map[err.data?.error] || err.message || 'Something went wrong. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#f4f6fb] dark:bg-[#090d1a] text-ink dark:text-gray-100 flex flex-col justify-between transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="w-full px-4 sm:px-8 py-3.5 flex items-center justify-between border-b border-gray-200/60 dark:border-gray-800/80 bg-white/70 dark:bg-[#0c1222]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <LogoWord sub="Core Platform" />
          <span className="hidden sm:inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-soft px-2.5 py-0.5 rounded-full border border-primary/20">
            INTERNAL ADMIN
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl bg-white dark:bg-[#161d31] border border-gray-200 dark:border-gray-700/70 text-muted dark:text-gray-300 grid place-items-center hover:bg-lavender dark:hover:bg-gray-800 transition cursor-pointer shadow-xs"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            <Icon name={dark ? 'sun' : 'moon'} size={15} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700/70 text-xs font-semibold text-muted dark:text-gray-300 hover:bg-lavender dark:hover:bg-gray-800 transition"
          >
            <span>Customer / Vendor Portal</span>
            <span>→</span>
          </button>
        </div>
      </header>

      {/* Main Full-Screen Center Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-4xl bg-white dark:bg-[#111728] rounded-3xl border border-gray-200/90 dark:border-gray-800/90 shadow-2xl shadow-navy/5 dark:shadow-black/40 overflow-hidden grid md:grid-cols-[44%_1fr] transition-all">
          {/* Brand Left Panel */}
          <aside
            className="relative p-7 sm:p-9 text-white flex flex-col justify-between overflow-hidden min-h-[480px]"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(9, 13, 29, 0.90) 0%, rgba(9, 13, 29, 0.65) 40%, rgba(9, 13, 29, 0.40) 70%, rgba(9, 13, 29, 0.92) 100%), url('https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1600&q=80')",
              backgroundSize: 'cover',
              backgroundPosition: 'center bottom',
            }}
          >
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-bold text-white/90">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                STARVNT Core OS
              </div>
            </div>

            <div className="relative my-auto py-8">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
                Welcome to Core Platform
              </h2>
              <p className="mt-2 text-white/80 text-xs sm:text-sm leading-relaxed">
                Platform control center for event execution, verified vendor governance, settlement escrow, and matching intelligence.
              </p>
              <p className="mt-6 text-white/70 italic text-xs leading-relaxed font-serif border-l-2 border-primary/60 pl-3">
                "People, events and possibilities — coordinated seamlessly."
              </p>
            </div>

            <div className="relative flex items-center justify-between text-white/50 text-[11px]">
              <span>admin.starvnt.com</span>
              <span className="font-mono">v2.4.0</span>
            </div>
          </aside>

          {/* Form Right Panel */}
          <div className="p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-white dark:bg-[#111728] transition-colors">
            <div className="w-full max-w-md mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-navy dark:text-white tracking-tight">
                    Sign In to Core
                  </h1>
                  <p className="text-xs sm:text-sm text-muted dark:text-gray-400 mt-1">
                    Enter your internal staff or Super Admin credentials
                  </p>
                </div>
              </div>

              {/* Demo Credentials Quick-Fill Pill */}
              <div className="mt-4 p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                    Default Super Admin
                  </div>
                  <div className="text-[11px] font-mono text-ink/80 dark:text-gray-300 mt-0.5">
                    <b>admin@starvnt.com</b> / <b>Password123</b>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shadow-xs transition cursor-pointer"
                >
                  ⚡ Auto Fill
                </button>
              </div>

              {/* Developer POV Test Login Workbench Link */}
              <div className="mt-3.5 p-3 rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 border border-purple-500/40 text-white flex items-center justify-between gap-3 shadow-md shadow-purple-950/20">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 grid place-items-center font-bold text-xs shrink-0 border border-purple-400/30">
                    ⚡
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-white flex items-center gap-1">
                      <span>Dev 1-Click Test Auth</span>
                      <span className="text-[9px] px-1 rounded bg-purple-500/30 text-purple-200 font-mono font-bold">/auth-test</span>
                    </div>
                    <div className="text-[10px] text-slate-300 truncate">4 Admins + 15 Vendors + 4 Customers</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/auth-test')}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-[11px] transition shrink-0 cursor-pointer shadow-xs flex items-center gap-1"
                >
                  <span>Open Workbench</span>
                  <span>→</span>
                </button>
              </div>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-ink/80 dark:text-gray-200 block mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#172036] px-3.5 py-2.5 text-sm text-navy dark:text-white placeholder:text-muted/60 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                    placeholder="admin@starvnt.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold text-ink/80 dark:text-gray-200">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#172036] px-3.5 py-2.5 pr-10 text-sm text-navy dark:text-white placeholder:text-muted/60 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-400 hover:text-navy dark:hover:text-white p-1 transition"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="flex items-center gap-2 text-muted dark:text-gray-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-primary"
                    />
                    <span>Remember this session</span>
                  </label>
                </div>

                {error && (
                  <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-3.5 py-2.5 animate-fadeIn">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-extrabold py-2.5 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Verifying Credentials…</span>
                    </>
                  ) : (
                    <span>Sign In to Platform</span>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end text-[11px] text-muted dark:text-gray-400">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="hover:underline text-muted dark:text-gray-400 hover:text-navy dark:hover:text-white"
                >
                  Vendor Login →
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-3 text-[11px] text-muted/70 dark:text-gray-500 border-t border-gray-200/50 dark:border-gray-800/60">
        STARVNT Internal Administrative Infrastructure · Restricted Access
      </footer>
    </div>
  );
}
