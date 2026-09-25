import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { LogoWord } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';

/**
 * Core login — matches the "Login" screen of the Complete Screen Set:
 * dark navy brand panel with quote, white form card with remember-me +
 * SSO buttons. INTERNAL identity domain only.
 */
export default function AdminLogin() {
  const { login } = useAdminAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate('/admin', { replace: true });
    } catch (err) {
      const map = {
        INVALID_CREDENTIALS: 'Incorrect email or password.',
        ACCOUNT_DISABLED: 'This admin account has been disabled.',
        RATE_LIMITED: 'Too many attempts — wait a few minutes and retry.',
      };
      setError(map[err.data?.error] || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb] flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Screen header label matching design spec: 1. Login */}
      <div className="w-full max-w-3xl mb-3 flex items-center justify-between px-1">
        <h1 className="text-base font-extrabold text-navy tracking-tight flex items-center gap-2">
          <span className="text-primary font-bold">1.</span> Login
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 text-muted grid place-items-center hover:bg-lavender transition cursor-pointer"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={14} />
          </button>
          <span className="text-[11px] font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
            STARVNT Core Platform
          </span>
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-gray-200/90 shadow-xl overflow-hidden grid md:grid-cols-[42%_1fr]">
        {/* Brand panel — illuminated marriage hall / wedding lawn tents matching Screenshot 2 */}
        <aside
          className="relative p-8 text-white flex flex-col justify-between overflow-hidden min-h-[500px]"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(10, 14, 32, 0.88) 0%, rgba(10, 14, 32, 0.55) 35%, rgba(10, 14, 32, 0.12) 65%, rgba(10, 14, 32, 0.75) 100%), url('https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1600&q=80')",
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
          }}
        >
          {/* Top: Logo */}
          <div className="relative">
            <LogoWord light sub="Core Platform" />
          </div>

          {/* Center: Headings & Quote */}
          <div className="relative my-auto py-8">
            <h2 className="text-2xl font-extrabold text-white tracking-tight leading-snug">
              Welcome to Core
            </h2>
            <p className="mt-2 text-white/80 text-xs sm:text-sm leading-relaxed">
              Manage the ecosystem.<br />
              Enable great events.
            </p>
            <p className="mt-8 text-white/60 italic text-xs leading-relaxed font-serif">
              "People, events and possibilities — together."
            </p>
          </div>

          {/* Bottom subtle text */}
          <div className="relative text-white/40 text-[10px]">
            admin.starvnt.com — restricted
          </div>
        </aside>

        {/* Form panel matching Screenshot 2 */}
        <main className="p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-white">
          <div className="w-full">
            <h2 className="text-xl sm:text-2xl font-extrabold text-navy tracking-tight">
              Sign in to your account
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-1">
              Here's the STARVNT Core Platform
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink/80 block mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 text-navy placeholder:text-muted/60"
                  placeholder="you@starvnt.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-ink/80">Password</label>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 text-navy placeholder:text-muted/60"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy p-1 transition"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <button type="button" className="text-xs text-primary font-semibold hover:underline">
                    Forgot password?
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-primary"
                />
                <span>Remember me</span>
              </label>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <button
                disabled={busy}
                className="w-full rounded-xl bg-[#5244e8] hover:bg-[#4335d6] text-white font-bold py-2.5 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Verifying…' : 'Sign In'}
              </button>

              <div className="flex items-center gap-3 text-xs text-muted pt-1">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-[11px] text-muted">Or continue with</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 py-2.5 px-3 text-xs font-bold text-navy hover:bg-lavender transition flex items-center justify-center gap-2 shadow-xs"
                  title="Continue with Google"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27a7.22 7.22 0 0 1 0-4.54V6.58H1.25a11.98 11.98 0 0 0 0 10.84l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  Continue with Google
                </button>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-[11px] text-muted">
              <span>Demo: admin@starvnt.com / AdminPass123!</span>
              <button
                onClick={() => navigate('/login')}
                className="text-primary hover:underline font-bold"
              >
                Vendor / Client Login →
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
