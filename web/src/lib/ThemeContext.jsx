import { createContext, useContext, useState, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isVendorThemeRoute } from '../../../shared/vendorTheme.js';

const ThemeContext = createContext({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }) {
  const location = useLocation();
  const locked = isVendorThemeRoute(location.pathname, location.search);
  const [preferredDark, setDark] = useState(() => {
    try {
      return localStorage.getItem('starvnt-theme') === 'dark';
    } catch {
      return false;
    }
  });

  const dark = locked || preferredDark;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', locked ? '#10111e' : dark ? '#000000' : '#f4f5fb');
    if (locked) root.dataset.productTheme = 'vendor';
    else delete root.dataset.productTheme;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      if (!locked) localStorage.setItem('starvnt-theme', preferredDark ? 'dark' : 'light');
    } catch {}
  }, [dark, locked, preferredDark]);

  return (
    <ThemeContext.Provider value={{ dark, locked, toggle: () => { if (!locked) setDark((d) => !d); } }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
