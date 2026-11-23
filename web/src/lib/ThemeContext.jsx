import { createContext, useContext, useState, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isVendorThemeRoute } from '../../../shared/vendorTheme.js';
import { applyVendorTheme } from './vendorThemeRuntime.js';

const ThemeContext = createContext({ dark: false, locked: false, toggle: () => {} });

export function ThemeProvider({ children }) {
  const location = useLocation();
  const isVendor = isVendorThemeRoute(location.pathname, location.search);
  const isAdmin = location.pathname.startsWith('/admin');

  const [preferredTheme, setPreferredTheme] = useState(() => {
    try {
      return localStorage.getItem('starvnt-theme');
    } catch {
      return null;
    }
  });

  // If user has explicitly saved 'dark' or 'light', honor their explicit preference.
  // Otherwise default vendor & admin to dark, and customer/public to light.
  const dark = preferredTheme != null
    ? preferredTheme === 'dark'
    : (isVendor || isAdmin);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', dark ? '#0b0d14' : '#f4f5fb');

    let restorePalette = null;
    if (dark) {
      root.classList.add('dark');
      if (isVendor) {
        root.dataset.productTheme = 'vendor';
        restorePalette = applyVendorTheme(root);
      } else {
        delete root.dataset.productTheme;
      }
    } else {
      root.classList.remove('dark');
      delete root.dataset.productTheme;
    }

    return () => restorePalette?.();
  }, [dark, isVendor]);

  const toggle = () => {
    const nextDark = !dark;
    const nextValue = nextDark ? 'dark' : 'light';
    setPreferredTheme(nextValue);
    try {
      localStorage.setItem('starvnt-theme', nextValue);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{ dark, locked: false, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
