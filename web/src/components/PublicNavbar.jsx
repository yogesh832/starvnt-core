import { Link, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../auth/ExternalAuthContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { LogoWord } from './ui.jsx';
import Icon from './Icon.jsx';

export default function PublicNavbar({ onPlanClick, activePage = 'landing' }) {
  const { user } = useExternalAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handlePlan() {
    if (onPlanClick) {
      onPlanClick('');
    } else {
      navigate('/?plan=true');
    }
  }

  return (
    <header className="w-full px-4 sm:px-8 lg:px-12 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-8 border-b border-white/60 dark:border-white/10 bg-white/60 dark:bg-navy/80 backdrop-blur-md sticky top-0 z-40 transition-all">
      <Link to="/" className="hover:opacity-90 transition flex items-center shrink-0">
        <LogoWord />
      </Link>

      <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink/70 dark:text-gray-300">
        <Link to="/" className="hover:text-primary transition">
          Explore
        </Link>
        <a href="/#how-it-works" className="hover:text-primary transition">
          How it works
        </a>
        <Link to="/login?as=vendor" className="hover:text-primary transition">
          For Vendors
        </Link>
      </nav>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {user ? (
          <>
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 text-muted dark:text-gray-300 grid place-items-center hover:bg-lavender dark:hover:bg-white/20 transition cursor-pointer"
              title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <Icon name={dark ? 'sun' : 'moon'} size={14} />
            </button>
            <button
              onClick={() => navigate(user.accountType === 'VENDOR' ? '/vendor' : '/customer')}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 transition shadow-sm shadow-primary/20 cursor-pointer whitespace-nowrap"
            >
              My Dashboard
            </button>
          </>
        ) : (
          <>
            {activePage === 'login' ? (
              <Link
                to="/"
                className="text-xs sm:text-sm font-bold text-ink/70 dark:text-gray-300 hover:text-primary px-2 transition hidden sm:block"
              >
                Explore
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-xs sm:text-sm font-bold text-ink/70 dark:text-gray-300 hover:text-primary px-2 transition"
              >
                Sign in
              </Link>
            )}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 text-muted dark:text-gray-300 grid place-items-center hover:bg-lavender dark:hover:bg-white/20 transition cursor-pointer"
              title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <Icon name={dark ? 'sun' : 'moon'} size={14} />
            </button>
            <button
              onClick={handlePlan}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-bold px-3 sm:px-5 py-2 sm:py-2.5 transition shadow-md shadow-primary/20 cursor-pointer whitespace-nowrap"
            >
              Plan an Event
            </button>
          </>
        )}
      </div>
    </header>
  );
}
