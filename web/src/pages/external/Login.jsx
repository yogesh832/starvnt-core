import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';
import PublicNavbar from '../../components/PublicNavbar.jsx';
import PublicFooter from '../../components/PublicFooter.jsx';
import { LogoWord } from '../../components/ui.jsx';

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
  const { dark, toggle: toggleTheme } = useTheme();
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
    category: '',
    city: '',
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
        businessName: mode === 'register' && form.businessName?.trim() ? form.businessName.trim() : undefined,
        brandName: mode === 'register' && form.businessName?.trim() ? form.businessName.trim() : undefined,
        category: mode === 'register' && form.category?.trim() ? form.category.trim() : undefined,
        city: mode === 'register' && form.city?.trim() ? form.city.trim() : undefined,
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

            const verifiedIdentifier =
              data?.identifier ||
              data?.data?.identifier ||
              data?.mobile ||
              data?.data?.mobile ||
              formattedIdentifier ||
              form.phone;
            const cleanPhone = verifiedIdentifier ? String(verifiedIdentifier).replace(/[^\d+]/g, '') : '';
            const normalizedPhone = cleanPhone
              ? (cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`)
              : undefined;

            const u = await loginWithWidgetOtp(token, {
              accountType,
              phone: normalizedPhone,
              fullName: form.fullName?.trim() || undefined,
              businessName: form.businessName?.trim() || undefined,
              brandName: form.businessName?.trim() || undefined,
              category: form.category?.trim() || undefined,
              city: form.city?.trim() || undefined,
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
        fullName: form.fullName?.trim() || undefined,
        businessName: mode === 'register' && form.businessName?.trim() ? form.businessName.trim() : undefined,
        brandName: mode === 'register' && form.businessName?.trim() ? form.businessName.trim() : undefined,
        category: mode === 'register' && form.category?.trim() ? form.category.trim() : undefined,
        city: mode === 'register' && form.city?.trim() ? form.city.trim() : undefined,
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
    'w-full rounded-xl border border-gray-200/90 bg-gray-50/40 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#efeaff] via-lavender to-white flex flex-col justify-between relative">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white shadow-md text-muted grid place-items-center hover:text-navy hover:bg-gray-50 transition cursor-pointer"
        title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {dark ? (
            <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-16v2m0 18v2m9-11h-2M5 12H3m14.485-6.485l-1.414 1.414M6.929 18.071l-1.414 1.414M18.485 18.485l-1.414-1.414M6.929 6.929L5.515 5.515" />
          ) : (
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          )}
        </svg>
      </button>

      {/* Integrated Navigation Bar matching Landing */}
      <PublicNavbar activePage="login" onPlanClick={() => navigate('/')} />

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="w-full max-w-4xl lg:max-w-5xl bg-white rounded-3xl sm:rounded-[32px] border border-gray-100/90 shadow-2xl shadow-primary/10 overflow-hidden grid md:grid-cols-[42%_1fr]">
          {/* Left: Brand & Luxury Visual Panel */}
          <aside
            className="relative p-7 sm:p-9 text-white flex flex-col justify-between overflow-hidden min-h-[300px] md:min-h-[620px] transition-all duration-700"
            style={{
              backgroundImage: `linear-gradient(to bottom, rgba(14, 19, 48, 0.92) 0%, rgba(14, 19, 48, 0.65) 45%, rgba(14, 19, 48, 0.40) 70%, rgba(14, 19, 48, 0.94) 100%), url('${
                accountType === 'VENDOR'
                  ? 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1600&q=85'
                  : 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1600&q=85'
              }')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Top Brand Logo */}
            <div className="relative z-10 flex items-center justify-between">
              <LogoWord light={true} sub={accountType === 'VENDOR' ? 'Vendor OS' : 'Events. Simplified.'} />
              <span className="text-[11px] font-bold text-white/90 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                {accountType === 'VENDOR' ? 'Studio OS' : 'Host & Client'}
              </span>
            </div>

            {/* Center Content */}
            <div className="relative z-10 my-auto py-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[11px] font-medium tracking-wide uppercase text-white/90 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>{accountType === 'VENDOR' ? 'Event Studio Operating System' : 'Event Coordination Platform'}</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
                {mode === 'login'
                  ? (accountType === 'VENDOR' ? 'Welcome back to Vendor OS.' : 'Welcome back.')
                  : (accountType === 'VENDOR' ? 'Scale your Event Studio.' : 'Join STARVNT.')}
              </h2>

              <p className="mt-2.5 text-white/85 text-xs sm:text-sm leading-relaxed max-w-sm">
                {accountType === 'VENDOR'
                  ? 'Manage incoming verified client leads, send instant calendar quotes, and secure milestone payouts.'
                  : 'Sign in to access your AI event planner Aura+, verified vendor quotes, and 100% escrow-protected bookings.'}
              </p>

              {/* Trust highlights */}
              <div className="mt-6 space-y-2.5 hidden sm:block">
                <div className="flex items-center gap-3 text-xs text-white/90 bg-white/10 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-white/10">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span><b className="font-semibold text-white">100% Core Escrow</b> payment protection</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/90 bg-white/10 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-white/10">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>{accountType === 'VENDOR' ? <><b className="font-semibold text-white">Direct Client Requests</b> with verified budgets</> : <><b className="font-semibold text-white">Top 1% Verified Vendors</b> and studios</>}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/90 bg-white/10 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-white/10">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span><b className="font-semibold text-white">Zero Hidden Charges</b> · Verified reviews only</span>
                </div>
              </div>
            </div>

            {/* Script Overlay Quote */}
            <div className="relative z-10 pt-4 border-t border-white/15">
              <p className="text-sm font-serif italic text-white/90 drop-shadow-sm">
                "Beautiful events create happier people."
              </p>
              <span className="text-[10px] uppercase tracking-widest text-white/70 font-bold mt-0.5 block">
                — STARVNT
              </span>
            </div>
          </aside>

          {/* Right: Auth Form Panel */}
          <main className="p-6 sm:p-10 flex flex-col justify-center bg-white">
            <div className="w-full">
              {/* Persona Switcher: Customer vs Vendor */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-navy tracking-tight">
                    {mode === 'login' ? 'Sign in to STARVNT' : 'Create an Account'}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {accountType === 'VENDOR' ? 'Operating as Verified Vendor / Brand' : 'Planning Events as Host & Client'}
                  </p>
                </div>

                {/* Persona Pill Switcher */}
                <div className="flex bg-gray-100/90 p-1 rounded-2xl text-xs font-bold shrink-0 border border-gray-200/50">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('CUSTOMER');
                      setError('');
                    }}
                    className={`px-3 sm:px-4 py-1.5 rounded-xl transition duration-150 cursor-pointer ${
                      accountType === 'CUSTOMER' ? 'bg-navy text-white shadow-sm' : 'text-muted hover:text-navy'
                    }`}
                  >
                    Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('VENDOR');
                      setError('');
                    }}
                    className={`px-3 sm:px-4 py-1.5 rounded-xl transition duration-150 cursor-pointer ${
                      accountType === 'VENDOR' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-navy'
                    }`}
                  >
                    Vendor OS
                  </button>
                </div>
              </div>

            {/* 3 Authentication Option Tabs */}
            <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 bg-lavender/80 rounded-2xl border border-gray-200/50">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('EMAIL');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  authMethod === 'EMAIL'
                    ? 'bg-white text-navy shadow-xs border border-gray-200/80 font-bold'
                    : 'text-muted hover:text-navy hover:bg-white/40'
                }`}
              >
                <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Email</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('PHONE');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  authMethod === 'PHONE'
                    ? 'bg-white text-navy shadow-xs border border-gray-200/80 font-bold'
                    : 'text-muted hover:text-navy hover:bg-white/40'
                }`}
              >
                <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>Mobile OTP</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('GOOGLE');
                  setError('');
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  authMethod === 'GOOGLE'
                    ? 'bg-white text-navy shadow-xs border border-gray-200/80 font-bold'
                    : 'text-muted hover:text-navy hover:bg-white/40'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27a7.22 7.22 0 0 1 0-4.54V6.58H1.25a11.98 11.98 0 0 0 0 10.84l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>Google</span>
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2 animate-fade">
                <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
                          <option value="">Select Category...</option>
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition p-1 cursor-pointer"
                      aria-label="Toggle password visibility"
                    >
                      {showPw ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-primary hover:bg-primary-dark active:scale-[0.99] text-white font-bold py-3 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer mt-1"
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
                              <option value="">Select Category...</option>
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
                              placeholder="e.g. Mumbai, Kolkata..."
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
                      className="w-full rounded-xl bg-primary hover:bg-primary-dark active:scale-[0.99] text-white font-bold py-2.5 text-sm shadow-md shadow-primary/25 transition disabled:opacity-60 cursor-pointer"
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
                        className="w-full mt-1 rounded-xl border border-primary/30 hover:border-primary bg-lavender/40 hover:bg-lavender/80 text-primary font-bold py-2.5 text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Launch MSG91 OTP Widget</span>
                      </button>
                      <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted mt-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>Encrypted live SMS & WhatsApp OTP via MSG91 Gateway</span>
                      </div>
                      <p className="text-[10px] text-ink/70 mt-1.5 bg-gray-50 border border-gray-200/70 rounded-xl p-2 leading-relaxed">
                        <b className="font-semibold text-ink">Tip:</b> If telecom SMS is delayed, select <b>"WhatsApp"</b> or <b>"Get Via Call"</b> inside the widget popup for instant delivery.
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
                          <option value="">Select Category...</option>
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
                          placeholder="e.g. Mumbai, Kolkata..."
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
            <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <span>{mode === 'login' ? 'New to STARVNT?' : 'Already have an account?'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                    setOtpSent(false);
                  }}
                  className="text-primary hover:underline font-bold cursor-pointer"
                >
                  {mode === 'login' ? 'Create an account →' : 'Sign in here →'}
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Protected by Core Escrow</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>

    {/* Integrated Public Footer with Trust Strip */}
    <PublicFooter showTrustStrip={true} />
  </div>
);
}
