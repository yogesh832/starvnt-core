import { Link, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../auth/ExternalAuthContext.jsx';
import { LogoWord } from './ui.jsx';

export default function PublicNavbar({ onPlanClick, activePage = 'landing' }) {
  const { user } = useExternalAuth();
  const navigate = useNavigate();

  function handlePlan() {
    if (onPlanClick) {
      onPlanClick('');
    } else {
      navigate('/?plan=true');
    }
  }

  return (
    <header className="w-full px-6 sm:px-12 py-4 flex items-center justify-between gap-8 border-b border-white/60 bg-white/60 backdrop-blur-md sticky top-0 z-40 transition-all">
      <Link to="/" className="hover:opacity-90 transition flex items-center">
        <LogoWord />
      </Link>

      <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink/70">
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

      <div className="flex items-center gap-3">
        {user ? (
          <button
            onClick={() => navigate(user.accountType === 'VENDOR' ? '/vendor' : '/customer')}
            className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-bold px-4 py-2.5 transition shadow-sm shadow-primary/20 cursor-pointer"
          >
            My Dashboard
          </button>
        ) : (
          <>
            {activePage === 'login' ? (
              <Link
                to="/"
                className="text-xs sm:text-sm font-bold text-ink/70 hover:text-primary px-2 transition"
              >
                Explore
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-xs sm:text-sm font-bold text-ink/70 hover:text-primary px-2 transition"
              >
                Sign in
              </Link>
            )}
            <button
              onClick={handlePlan}
              className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-bold px-4 sm:px-5 py-2.5 transition shadow-md shadow-primary/20 cursor-pointer"
            >
              Plan an Event
            </button>
          </>
        )}
      </div>
    </header>
  );
}
