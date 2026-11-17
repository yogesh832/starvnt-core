import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PORTAL_SURFACE } from '../lib/portalAccess.js';

/** Public canonical URLs never include auth redirects, query strings or tokens. */
export default function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const origin = PORTAL_SURFACE === 'VENDOR' ? 'https://vendor.starvnt.com' : 'https://starvnt.com';
    const publicPage = ['/', '/privacy', '/privacy-policy', '/terms'].includes(pathname) || /^\/vendors\/[^/]+\/?$/.test(pathname);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    // Private/token-bearing routes receive no canonical or indexable URL.
    if (publicPage) canonical.href = `${origin}${pathname === '/privacy-policy' ? '/privacy' : pathname}`;
    else canonical.remove();
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = publicPage ? 'index, follow' : 'noindex, nofollow';
    return () => { canonical.remove(); robots.remove(); };
  }, [pathname]);
  return null;
}
