import { useEffect, useRef } from 'react';

export default function useCustomerRefresh(reload, key) {
  const current = useRef(reload);
  current.current = reload;
  useEffect(() => {
    const refresh = () => { if (!document.hidden) current.current(); };
    const interval = setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [key]);
}
