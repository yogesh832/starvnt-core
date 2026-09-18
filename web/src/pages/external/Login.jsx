import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { LogoWord } from '../../components/ui.jsx';

/**
 * Single EXTERNAL auth — one sign-in/register flow for Customers + Vendors,
 * styled after the screen-set login: dark brand panel + white form card.
 */
export default function ExternalLogin() {
  const { login, register, user } = useExternalAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const isRegisterPath = window.location.pathname === '/signup' || window.location.pathname === '/register' || params.get('mode') === 'register';
  const [mode, setMode] = useState(isRegisterPath ? 'register' : 'login');
  const [accountType, setAccountType] = useState(params.get('as') === 'vendor' ? 'VENDOR' : 'CUSTOMER');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    businessName: '',
    category: 'Cinematic Production',
    city: 'Mumbai',
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) navigate(user.accountType === 'VENDOR' ? '/vendor' : '/customer', { replace: true });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u =
        mode === 'login'
          ? await login(form.email, form.password)
          : await register({
              fullName: form.fullName,
              email: form.email,
              password: form.password,
              accountType,
              businessName: accountType === 'VENDOR' ? form.businessName : undefined,
              brandName: accountType === 'VENDOR' ? form.businessName : undefined,
              category: accountType === 'VENDOR' ? form.category : undefined,
              city: accountType === 'VENDOR' ? form.city : undefined,
            });
      navigate(u.accountType === 'VENDOR' ? '/vendor' : '/customer', { replace: true });
    } catch (err) {
      const map = {
        INVALID_CREDENTIALS: 'Incorrect email or password.',
        EMAIL_IN_USE: 'That email is already registered — try signing in.',
        WEAK_PASSWORD: 'Password needs 8+ chars with a letter and a number.',
        BUSINESS_NAME_REQUIRED: 'Please add your business name.',
        RATE_LIMITED: 'Too many attempts — wait a few minutes and retry.',
      };
      setError(map[err.data?.error] || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50';

  return (
    <div className="min-h-screen bg-[#f3f6fb] flex flex-col items-center justify-center p-3 sm:p-6 md:p-8">
      {/* Top Header spec banner */}
      <div className="w-full max-w-4xl mb-3 flex items-center justify-between px-1">
        <h1 className="text-base font-extrabold text-navy tracking-tight flex items-center gap-2">
          <span className="text-primary font-bold">1.</span> {mode === 'login' ? 'Login' : 'Signup'}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
            {mode === 'login' ? 'Customer & Vendor Access' : 'New Account Registration'}
          </span>
          <Link
            to="/admin/login"
            className="text-[11px] font-bold text-muted hover:text-navy px-2 py-1 transition"
          >
            Core Admin →
          </Link>
        </div>
      </div>

      {/* Main Card Container matching Screenshot 2 */}
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-gray-200/90 shadow-xl overflow-hidden grid md:grid-cols-[40%_1fr]">
        {/* Brand panel — illuminated marriage hall / wedding lawn tents */}
        <aside
          className="relative p-6 sm:p-8 text-white flex flex-col justify-between overflow-hidden min-h-[220px] md:min-h-[560px]"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(10, 14, 32, 0.88) 0%, rgba(10, 14, 32, 0.55) 35%, rgba(10, 14, 32, 0.12) 65%, rgba(10, 14, 32, 0.75) 100%), url('https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1600&q=80')",
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
          }}
        >
          {/* Top: Logo */}
          <div className="relative">
            <div className="flex items-center gap-2 text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
                <path
                  d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <div className="font-extrabold tracking-tight text-lg leading-tight">STARVNT</div>
                <div className="text-[9px] text-white/80 leading-tight">Events. Simplified.</div>
              </div>
            </div>
          </div>

          {/* Center: Headings & Quote */}
          <div className="relative my-auto py-4 md:py-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
              {mode === 'login' ? 'Welcome back.' : 'Join STARVNT.'}
            </h2>
            <p className="mt-2 text-white/85 text-xs sm:text-sm leading-relaxed max-w-xs">
              Plan unforgettable weddings & events — or power them as a vendor. One ecosystem.
            </p>
            <p className="mt-6 text-white/70 italic text-xs leading-relaxed font-serif hidden md:block">
              "People, events and possibilities — together."
            </p>
          </div>

          {/* Bottom subtle text */}
          <div className="relative text-white/50 text-[10px] hidden md:block">
            customers.starvnt.com · vendors.starvnt.com
          </div>
        </aside>

        {/* Form Panel */}
        <main className="p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-white">
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-navy tracking-tight">
                {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted">
              {mode === 'login' ? 'Events. Simplified. Pick your portal.' : 'Customer or vendor — pick your lane.'}
            </p>

            {mode === 'register' && (
              <div className="mt-4 grid grid-cols-2 gap-2 p-1 bg-lavender rounded-xl">
                {[
                  ['CUSTOMER', "I'm planning an event"],
                  ['VENDOR', "I'm a vendor"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAccountType(value)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      accountType === value ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-3.5">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-ink/80 mb-1">Full name</label>
                  <input
                    className={inputCls}
                    placeholder="Aarav Mehta"
                    value={form.fullName}
                    onChange={set('fullName')}
                    required
                  />
                </div>
              )}

              {mode === 'register' && accountType === 'VENDOR' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-ink/80 mb-1">Brand name</label>
                    <input
                      className={inputCls}
                      placeholder="CineMandap Studios"
                      value={form.businessName}
                      onChange={set('businessName')}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink/80 mb-1">Category</label>
                      <select
                        className={inputCls}
                        value={form.category}
                        onChange={set('category')}
                        required
                      >
                        <option value="Cinematic Production">Cinematic Production</option>
                        <option value="Photography">Photography</option>
                        <option value="Videography">Videography</option>
                        <option value="Decor & Styling">Decor & Styling</option>
                        <option value="Catering">Catering</option>
                        <option value="Makeup & Styling">Makeup & Styling</option>
                        <option value="DJ & Music">DJ & Music</option>
                        <option value="Venue">Venue</option>
                        <option value="Event Planning">Event Planning</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink/80 mb-1">City</label>
                      <input
                        className={inputCls}
                        placeholder="Mumbai"
                        value={form.city}
                        onChange={set('city')}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink/80 mb-1">Email address</label>
                <input
                  type="email"
                  className={inputCls}
                  placeholder="you@starvnt.com"
                  value={form.email}
                  onChange={set('email')}
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-ink/80">Password</label>
                  {mode === 'login' && (
                    <button type="button" className="text-xs text-primary font-semibold hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className={`${inputCls} pr-10`}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={set('password')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy text-xs"
                    aria-label="Toggle password visibility"
                  >
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <button
                disabled={busy}
                className="w-full rounded-xl bg-[#5244e8] hover:bg-[#4335d6] text-white font-bold py-2.5 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <div className="flex items-center gap-3 text-xs text-muted pt-1">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-[11px] text-muted">Or continue with</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  Google
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 py-2.5 px-3 text-xs font-bold text-navy hover:bg-lavender transition flex items-center justify-center gap-2 shadow-xs"
                  title="Continue with Microsoft"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24">
                    <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                    <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                    <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                    <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                  </svg>
                  Microsoft
                </button>
              </div>
            </form>

            <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-muted">
              {mode === 'login' ? (
                <>
                  <span>New to STARVNT?</span>
                  <button
                    onClick={() => setMode('register')}
                    className="text-primary hover:underline font-bold"
                  >
                    Create an account →
                  </button>
                </>
              ) : (
                <>
                  <span>Already registered?</span>
                  <button
                    onClick={() => setMode('login')}
                    className="text-primary hover:underline font-bold"
                  >
                    Sign in here →
                  </button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
