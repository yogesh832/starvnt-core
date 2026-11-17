import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('starvnt-theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const originalThemeColor = themeColor?.getAttribute('content');
    if (dark) themeColor?.setAttribute('content', '#000000');
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('starvnt-theme', dark ? 'dark' : 'light');
    } catch {}
    return () => {
      if (originalThemeColor) themeColor?.setAttribute('content', originalThemeColor);
    };
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
