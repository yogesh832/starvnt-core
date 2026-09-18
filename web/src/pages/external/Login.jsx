import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '1009726530856-34nc725qvptbshmfbrtpjcis8j3pu1iq.apps.googleusercontent.com';

const MSG91_WIDGET_ID =
  import.meta.env.VITE_MSG91_WIDGET_ID || '366967656c57323638313136';
const MSG91_WIDGET_TOKEN =
  import.meta.env.VITE_MSG91_WIDGET_TOKEN || '567508TgmtIu2qfrl6a9e4925P1';

/**
 * Universal EXTERNAL Authentication:
 * Supports Customers & Vendors with 3 independent authentication methods:
 * 1. Google OAuth / One-Tap Login
 * 2. Mobile Phone + OTP (MSG91 OTP Widget)
 * 3. Email & Password
 */
export default function ExternalLogin() {
  const {
    login,
    register,
    loginWithGoogle,
    sendOtp,
    loginWithOtp,
    loginWithWidgetOtp,
    user,
  } = useExternalAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const isRegisterPath =
    window.location.pathname === '/signup' ||
    window.location.pathname === '/register' ||
    params.get('mode') === 'register';

  const [mode, setMode] = useState(isRegisterPath ? 'register' : 'login');
  const [accountType, setAccountType] = useState(
    params.get('as') === 'vendor' ? 'VENDOR' : 'CUSTOMER'
  );
  // Auth Method: 'GOOGLE' | 'PHONE' | 'EMAIL'
  const [authMethod, setAuthMethod] = useState('EMAIL');

  // Form State
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    otp: '',
    businessName: '',
    category: 'Cinematic Production',
    city: 'Mumbai',
  });

  // Phone OTP States
  const [otpSent, setOtpSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState('');
  const [timer, setTimer] = useState(0);

  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (user) {
      navigate(user.accountType === 'VENDOR' ? '/vendor' : '/customer', { replace: true });
    }
  }, [user, navigate]);

  // OTP Countdown Timer
  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  // Initialize Google Identity Services
  useEffect(() => {
    if (authMethod !== 'GOOGLE' && mode !== 'login') return;

    function initGoogle() {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
        });

        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: mode === 'login' ? 'signin_with' : 'signup_with',
            shape: 'rectangular',
          });
        }
      }
    }

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          initGoogle();
          clearInterval(checkInterval);
        }
      }, 200);
      return () => clearInterval(checkInterval);
    }
  }, [authMethod, mode, accountType]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // ── Handler 1: Email & Password ───────────────────────────────────────────
  async function handleEmailSubmit(e) {
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
              phone: form.phone,
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
        BUSINESS_NAME_REQUIRED: 'Please add your brand / business name.',
        RATE_LIMITED: 'Too many attempts — wait a few minutes and retry.',
      };
      setError(map[err.data?.error] || err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Handler 2: Google Authentication ──────────────────────────────────────
  async function handleGoogleCredentialResponse(response) {
    if (!response?.credential) return;
    setError('');
    setBusy(true);
    try {
      const u = await loginWithGoogle(response.credential, {
        accountType,
        businessName: form.businessName,
        brandName: form.businessName,
        category: form.category,
        city: form.city,
      });
      navigate(u.accountType === 'VENDOR' ? '/vendor' : '/customer', { replace: true });
    } catch (err) {
      setError(err.data?.error || err.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function triggerGoogleDirect() {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In SDK is loading. Please try again in a moment.');
    }
  }

  // ── Handler 3: MSG91 OTP Widget & Fallback ────────────────────────────────
  function openMsg91Widget(phoneParam) {
    setError('');
    const targetPhone = phoneParam || form.phone;
    const cleanDigits = targetPhone ? String(targetPhone).replace(/\D/g, '') : '';
    const formattedIdentifier = cleanDigits
      ? (cleanDigits.startsWith('91') && cleanDigits.length === 12
          ? cleanDigits
          : `91${cleanDigits.slice(-10)}`)
      : undefined;

    if (!window.initSendOTP) {
      setError('MSG91 OTP Widget is loading. Please wait a moment and try again.');
      return;
    }

    setBusy(true);
    try {
      window.initSendOTP({
        widgetId: MSG91_WIDGET_ID,
        tokenAuth: MSG91_WIDGET_TOKEN,
        identifier: formattedIdentifier,
        success: async (data) => {
          setBusy(true);
          try {
            const token =
              typeof data === 'string'
                ? data
                : data?.message || data?.['access-token'] || data?.token || JSON.stringify(data);
            const u = await loginWithWidgetOtp(token, {
              accountType,
              phone: formattedIdentifier ? `+${formattedIdentifier}` : form.phone,
              fullName: form.fullName,
              businessName: form.businessName,
              brandName: form.businessName,
              category: form.category,
              city: form.city,
            });
            navigate(u.accountType === 'VENDOR' ? '/vendor' : '/customer', { replace: true });
          } catch (err) {
            setError(err.data?.error || err.message || 'OTP verification failed.');
          } finally {
            setBusy(false);
          }
        },
        failure: (err) => {
          setBusy(false);
          if (err && (err.message || err.error)) {
            setError(err.message || err.error || 'MSG91 OTP verification cancelled.');
          }
        },
      });
    } catch (err) {
      setBusy(false);
      setError(err.message || 'Failed to initialize MSG91 OTP widget.');
    }
  }

  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    if (!form.phone || form.phone.trim().length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    // Launch official MSG91 OTP Widget for real SMS / WhatsApp verification
    if (window.initSendOTP) {
      openMsg91Widget(form.phone);
      return;
    }

    // Direct backend fallback
    setError('');
    setBusy(true);
    try {
      await sendOtp(form.phone);
      setOtpSent(true);
      setTimer(60);
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to send OTP. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!form.otp || form.otp.trim().length < 4) {
      setError('Please enter the verification code.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const u = await loginWithOtp(form.phone, form.otp, {
        accountType,
        fullName: form.fullName,
        businessName: form.businessName,
        brandName: form.businessName,
        category: form.category,
        city: form.city,
      });
      navigate(u.accountType === 'VENDOR' ? '/vendor' : '/customer', { replace: true });
    } catch (err) {
      const map = {
        INVALID_OTP: 'Invalid OTP code. Please check and retry.',
        OTP_EXPIRED_OR_NOT_FOUND: 'OTP expired. Please request a new one.',
        TOO_MANY_ATTEMPTS: 'Too many failed attempts. Request a new OTP.',
      };
      setError(map[err.data?.error] || err.message || 'OTP verification failed.');
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition';

  return (
    <div className="min-h-screen bg-[#f3f6fb] flex flex-col items-center justify-center p-3 sm:p-6 md:p-8">
      {/* Header bar */}
      <div className="w-full max-w-4xl mb-3 flex items-center justify-between px-1">
        <h1 className="text-base font-extrabold text-navy tracking-tight flex items-center gap-2">
          <span className="text-primary font-bold">1.</span> {mode === 'login' ? 'Login' : 'Signup'}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
            {mode === 'login' ? 'Customer & Vendor Access' : 'New Registration'}
          </span>
          <Link
            to="/admin/login"
            className="text-[11px] font-bold text-muted hover:text-navy px-2 py-1 transition"
          >
            Core Admin →
          </Link>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-gray-200/90 shadow-xl overflow-hidden grid md:grid-cols-[38%_1fr]">
        {/* Left: Brand Panel */}
        <aside
          className="relative p-6 sm:p-8 text-white flex flex-col justify-between overflow-hidden min-h-[220px] md:min-h-[580px]"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(10, 14, 32, 0.88) 0%, rgba(10, 14, 32, 0.55) 35%, rgba(10, 14, 32, 0.12) 65%, rgba(10, 14, 32, 0.75) 100%), url('https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1600&q=80')",
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
          }}
        >
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

          <div className="relative my-auto py-4 md:py-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
              {mode === 'login' ? 'Welcome back.' : 'Join STARVNT.'}
            </h2>
            <p className="mt-2 text-white/85 text-xs sm:text-sm leading-relaxed max-w-xs">
              Sign in with your Google account, Mobile OTP, or Email & Password.
            </p>
            <div className="mt-5 space-y-2 hidden md:block">
              <div className="flex items-center gap-2 text-xs text-white/90">
                <span className="text-emerald-400 font-bold">✓</span> Real-time client lead matching
              </div>
              <div className="flex items-center gap-2 text-xs text-white/90">
                <span className="text-emerald-400 font-bold">✓</span> Core Escrow payment protection
              </div>
              <div className="flex items-center gap-2 text-xs text-white/90">
                <span className="text-emerald-400 font-bold">✓</span> Authentic verified reviews only
              </div>
            </div>
          </div>

          <div className="relative text-white/50 text-[10px] hidden md:block">
            customers.starvnt.com · vendors.starvnt.com
          </div>
        </aside>

        {/* Right: Auth Form Panel */}
        <main className="p-6 sm:p-8 flex flex-col justify-center bg-white">
          <div className="w-full">
            {/* Persona Switcher: Customer vs Vendor */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-extrabold text-navy tracking-tight">
                  {mode === 'login' ? 'Sign in to STARVNT' : 'Create an Account'}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {accountType === 'VENDOR' ? 'Operating as Vendor / Brand' : 'Planning Events as Customer'}
                </p>
              </div>

              {/* Persona Pill */}
              <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAccountType('CUSTOMER')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    accountType === 'CUSTOMER' ? 'bg-white text-navy shadow-xs' : 'text-muted hover:text-navy'
                  }`}
                >
                  Customer
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('VENDOR')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    accountType === 'VENDOR' ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-navy'
                  }`}
                >
                  Vendor OS
                </button>
              </div>
            </div>

            {/* 3 Authentication Option Tabs */}
            <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 bg-lavender/70 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('EMAIL');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  authMethod === 'EMAIL'
                    ? 'bg-white text-navy shadow-xs border border-gray-200/60'
                    : 'text-muted hover:text-navy'
                }`}
              >
                <span>✉️</span> Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('PHONE');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  authMethod === 'PHONE'
                    ? 'bg-white text-navy shadow-xs border border-gray-200/60'
                    : 'text-muted hover:text-navy'
                }`}
              >
                <span>📱</span> Mobile OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('GOOGLE');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  authMethod === 'GOOGLE'
                    ? 'bg-white text-navy shadow-xs border border-gray-200/60'
                    : 'text-muted hover:text-navy'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27a7.22 7.22 0 0 1 0-4.54V6.58H1.25a11.98 11.98 0 0 0 0 10.84l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                Google
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2 animate-fade">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* ───────── OPTION 1: EMAIL & PASSWORD ───────── */}
            {authMethod === 'EMAIL' && (
              <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
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
                    <div className="grid grid-cols-2 gap-2.5">
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

                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-ink/80 mb-1">Mobile Number</label>
                    <div className="flex gap-2">
                      <span className="px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-navy grid place-items-center">
                        +91
                      </span>
                      <input
                        type="tel"
                        className={inputCls}
                        placeholder="98765 43210"
                        value={form.phone}
                        onChange={set('phone')}
                        required
                      />
                    </div>
                    <p className="text-[10px] text-muted mt-1">Links your phone for instant Mobile OTP login anytime.</p>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-ink/80">Password</label>
                    {mode === 'login' && (
                      <span className="text-[11px] text-primary hover:underline cursor-pointer">
                        Forgot password?
                      </span>
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

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#5244e8] hover:bg-[#4335d6] text-white font-bold py-2.5 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer mt-1"
                >
                  {busy ? 'Please wait…' : mode === 'login' ? `Sign In as ${accountType === 'VENDOR' ? 'Vendor' : 'Customer'}` : 'Create Account'}
                </button>
              </form>
            )}

            {/* ───────── OPTION 2: MOBILE PHONE OTP ───────── */}
            {authMethod === 'PHONE' && (
              <div className="mt-4 space-y-3.5">
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-3">
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
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-ink/80 mb-1">Category</label>
                            <select
                              className={inputCls}
                              value={form.category}
                              onChange={set('category')}
                            >
                              <option value="Cinematic Production">Cinematic Production</option>
                              <option value="Photography">Photography</option>
                              <option value="Decor & Styling">Decor & Styling</option>
                              <option value="Catering">Catering</option>
                              <option value="DJ & Music">DJ & Music</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-ink/80 mb-1">City</label>
                            <input
                              className={inputCls}
                              placeholder="Mumbai"
                              value={form.city}
                              onChange={set('city')}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-ink/80 mb-1">Mobile Number</label>
                      <div className="flex gap-2">
                        <span className="px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-navy grid place-items-center">
                          +91
                        </span>
                        <input
                          type="tel"
                          className={inputCls}
                          placeholder="98765 43210"
                          value={form.phone}
                          onChange={set('phone')}
                          required
                          autoFocus
                        />
                      </div>
                      <p className="text-[10px] text-muted mt-1">We'll send a 6-digit OTP code to verify your phone.</p>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-xl bg-[#5244e8] hover:bg-[#4335d6] text-white font-bold py-2.5 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer"
                    >
                      {busy ? 'Connecting to MSG91…' : 'Send Real OTP via MSG91 →'}
                    </button>

                    <div className="pt-1">
                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink mx-2 text-[10px] text-muted uppercase font-semibold">or one-click</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openMsg91Widget()}
                        disabled={busy}
                        className="w-full mt-1 rounded-xl border-2 border-[#5244e8]/30 hover:border-[#5244e8] bg-lavender/30 hover:bg-lavender/60 text-primary font-bold py-2 text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <span>🛡️</span>
                        <span>Launch MSG91 OTP Widget</span>
                      </button>
                      <p className="text-[10px] text-center text-muted mt-2">
                        🔒 Verified live SMS / WhatsApp OTP delivered by MSG91 Gateway
                      </p>
                      <p className="text-[10px] text-center text-ink/70 mt-1 bg-amber-50 border border-amber-200/60 rounded-lg p-1.5">
                        💡 <b>Tip:</b> If telecom SMS is delayed, select <b>"WhatsApp"</b> or <b>"Get Via Call"</b> inside the widget popup for instant delivery.
                      </p>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-3 animate-fade">
                    <div className="p-3 bg-lavender/50 rounded-2xl border border-primary/20 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-muted">OTP sent to: </span>
                        <b className="text-navy">{form.phone}</b>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setForm({ ...form, otp: '' });
                          setError('');
                        }}
                        className="text-[11px] font-bold text-primary hover:underline"
                      >
                        Change
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-ink/80 mb-1">6-Digit Verification Code</label>
                      <input
                        type="text"
                        maxLength={6}
                        className={`${inputCls} tracking-widest text-center text-lg font-extrabold text-navy`}
                        placeholder="••••••"
                        value={form.otp}
                        onChange={set('otp')}
                        required
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 text-sm shadow-md shadow-emerald-600/25 transition disabled:opacity-60 cursor-pointer"
                    >
                      {busy ? 'Verifying OTP…' : `Verify & Sign In as ${accountType === 'VENDOR' ? 'Vendor' : 'Customer'}`}
                    </button>

                    <div className="flex justify-between items-center text-xs text-muted pt-1">
                      <span>Didn't receive code?</span>
                      {timer > 0 ? (
                        <span className="font-semibold text-muted">Resend in {timer}s</span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          className="font-bold text-primary hover:underline"
                        >
                          Resend OTP
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ───────── OPTION 3: GOOGLE ONE-TAP / OAUTH ───────── */}
            {authMethod === 'GOOGLE' && (
              <div className="mt-4 space-y-4 animate-fade">
                {mode === 'register' && accountType === 'VENDOR' && (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-2xl border border-gray-200/80 mb-3">
                    <div className="text-xs font-bold text-navy">Vendor Registration Details:</div>
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
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-ink/80 mb-1">Category</label>
                        <select
                          className={inputCls}
                          value={form.category}
                          onChange={set('category')}
                        >
                          <option value="Cinematic Production">Cinematic Production</option>
                          <option value="Photography">Photography</option>
                          <option value="Decor & Styling">Decor & Styling</option>
                          <option value="Catering">Catering</option>
                          <option value="DJ & Music">DJ & Music</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink/80 mb-1">City</label>
                        <input
                          className={inputCls}
                          placeholder="Mumbai"
                          value={form.city}
                          onChange={set('city')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted text-center">
                  Sign in instantly using your verified Google account. We will link your credentials securely with zero password needed.
                </p>

                {/* Google GSI official rendered button container */}
                <div ref={googleBtnRef} className="w-full flex justify-center min-h-[44px]" />

                <button
                  type="button"
                  onClick={triggerGoogleDirect}
                  disabled={busy}
                  className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-xs font-bold text-navy hover:bg-lavender transition flex items-center justify-center gap-2.5 shadow-xs"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27a7.22 7.22 0 0 1 0-4.54V6.58H1.25a11.98 11.98 0 0 0 0 10.84l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  {busy ? 'Authenticating…' : `Continue with Google as ${accountType === 'VENDOR' ? 'Vendor' : 'Customer'}`}
                </button>
              </div>
            )}

            {/* Bottom Toggle between Login & Register */}
            <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-muted">
              {mode === 'login' ? (
                <>
                  <span>New to STARVNT?</span>
                  <button
                    onClick={() => {
                      setMode('register');
                      setError('');
                      setOtpSent(false);
                    }}
                    className="text-primary hover:underline font-bold cursor-pointer"
                  >
                    Create an account →
                  </button>
                </>
              ) : (
                <>
                  <span>Already have an account?</span>
                  <button
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setOtpSent(false);
                    }}
                    className="text-primary hover:underline font-bold cursor-pointer"
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
