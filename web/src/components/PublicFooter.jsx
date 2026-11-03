import { Link } from 'react-router-dom';
import { LogoWord } from './ui.jsx';

export default function PublicFooter({ showTrustStrip = true }) {
  return (
    <footer className="w-full mt-auto">
      {/* Product information; market and custody claims are omitted until verified. */}
      {showTrustStrip && (
        <div className="bg-white/85 dark:bg-[#1a1d2e]/85 backdrop-blur-xs border-t border-b border-gray-100 dark:border-gray-800 py-6 px-6 sm:px-12">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-6">
            <div className="text-sm font-bold text-muted">Plan event details, discover vendor services, and manage booking information in one place.</div>
            <div className="text-xs text-muted">Availability depends on each vendor’s listed service coverage.</div>
          </div>
        </div>
      )}

      {/* Main Footer Links */}
      <div className="bg-white/95 dark:bg-[#1a1d2e]/95 border-t border-gray-100/80 dark:border-gray-800/80 py-12 px-6 sm:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="inline-block hover:opacity-90 transition">
              <LogoWord />
            </Link>
            <p className="text-xs sm:text-sm text-muted max-w-sm leading-relaxed">
              Tools for planning events, discovering vendor services, and managing booking details.
            </p>
            <p className="pt-1 text-xs text-muted">Payment status is shown after provider confirmation.</p>
          </div>

          {/* Public customer and partner journeys */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-navy dark:text-white">Explore STARVNT</div>
            <ul className="space-y-2 text-xs text-muted">
              <li>
                <a href="/#experiences" className="hover:text-primary transition">Event experiences</a>
              </li>
              <li>
                <a href="/#how-it-works" className="hover:text-primary transition">How it works</a>
              </li>
              <li>
                <a href="/#aura" className="hover:text-primary transition">Aura+ assistance</a>
              </li>
              <li>
                <a href="/#plan-event" className="hover:text-primary transition">Plan your event</a>
              </li>
              <li>
                <a href="https://vendor.starvnt.com/signup?as=vendor" className="hover:text-primary transition">Become a partner</a>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Internal */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-navy">Trust & Legal</div>
            <ul className="space-y-2 text-xs text-muted">
              <li>
                <Link to="/privacy" className="hover:text-primary transition">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-primary transition">
                  Terms of Service
                </Link>
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
            <span>Vendor coverage varies by service and location.</span>
            <span className="text-primary font-semibold">Events. Simplified.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
