import { Link } from 'react-router-dom';
import { LogoWord } from './ui.jsx';

export default function PublicFooter({ showTrustStrip = true }) {
  return (
    <footer className="w-full mt-auto">
      {/* Trust Strip */}
      {showTrustStrip && (
        <div className="bg-white/85 dark:bg-[#1a1d2e]/85 backdrop-blur-xs border-t border-b border-gray-100 dark:border-gray-800 py-6 px-6 sm:px-12">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-6">
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Trusted by thousands across India
            </div>
            <div className="flex flex-wrap gap-8 sm:gap-14">
              {[
                ['10K+', 'Events Planned'],
                ['4.8/5', 'Customer Rating'],
                ['5K+', 'Verified Vendors'],
                ['100%', 'Secure Payments'],
              ].map(([v, l]) => (
                <div key={l}>
                  <div className="text-lg sm:text-xl font-extrabold text-navy">{v}</div>
                  <div className="text-[11px] text-muted">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Footer Links */}
      <div className="bg-white/95 dark:bg-[#1a1d2e]/95 border-t border-gray-100/80 dark:border-gray-800/80 py-12 px-6 sm:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="inline-block hover:opacity-90 transition">
              <LogoWord />
            </Link>
            <p className="text-xs sm:text-sm text-muted max-w-sm leading-relaxed">
              The AI-native ecosystem for modern events. Plan, book, and celebrate with verified vendors, transparent pricing, and 100% escrow protection.
            </p>
            <div className="flex items-center gap-2 pt-1 text-xs font-semibold text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Core Escrow & Settlement Active</span>
            </div>
          </div>

          {/* Column 1: Plan Events */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-navy">Plan Events</div>
            <ul className="space-y-2 text-xs text-muted">
              <li>
                <Link to="/" className="hover:text-primary transition">
                  Weddings & Receptions
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-primary transition">
                  Birthdays & Parties
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-primary transition">
                  Corporate Galas
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-primary transition">
                  Aura+ AI Planner
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-primary transition">
                  Budget Estimator
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: For Vendors */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-navy">For Vendors</div>
            <ul className="space-y-2 text-xs text-muted">
              <li>
                <Link to="/login?as=vendor" className="hover:text-primary transition">
                  Vendor OS Portal
                </Link>
              </li>
              <li>
                <Link to="/signup?as=vendor" className="hover:text-primary transition">
                  Register as Vendor
                </Link>
              </li>
              <li>
                <Link to="/login?as=vendor" className="hover:text-primary transition">
                  Live Lead Matching
                </Link>
              </li>
              <li>
                <Link to="/login?as=vendor" className="hover:text-primary transition">
                  Milestone Payouts
                </Link>
              </li>
              <li>
                <Link to="/login?as=vendor" className="hover:text-primary transition">
                  Studio Showcases
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Internal */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-navy">Trust & Legal</div>
            <ul className="space-y-2 text-xs text-muted">
              <li>
                <span className="cursor-pointer hover:text-primary transition">
                  Core Escrow Protection
                </span>
              </li>
              <li>
                <span className="cursor-pointer hover:text-primary transition">
                  Privacy Policy
                </span>
              </li>
              <li>
                <span className="cursor-pointer hover:text-primary transition">
                  Terms of Service
                </span>
              </li>
              <li>
                <span className="cursor-pointer hover:text-primary transition">
                  Verified Reviews Only
                </span>
              </li>
              <li className="pt-2">
                <Link
                  to="/admin/login"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-navy transition"
                >
                  <span>Internal Admin Portal</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-end gap-4 text-xs text-muted">
          <div className="flex items-center gap-6">
            <span>Mumbai · Bengaluru · Delhi NCR · Goa</span>
            <span className="text-primary font-semibold">Events. Simplified.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
