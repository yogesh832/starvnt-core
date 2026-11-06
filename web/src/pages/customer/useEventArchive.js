import { useEffect, useState } from 'react';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { archiveStorageKey, parseArchivedEvents, CLOSED_EVENTS } from './accountState.js';

const CHANGED = 'starvnt-event-archive-changed';
export default function useEventArchive() {
  const { user } = useExternalAuth();
  const key = archiveStorageKey(user?.id || user?._id);
  const [state, setState] = useState({ key: null, ids: [] }), [error, setError] = useState('');
  useEffect(() => {
    const read = event => {
      if (event?.type === 'storage' && event.key !== null && event.key !== key) return;
      if (event?.type === CHANGED && event.detail !== key) return;
      try { setState({ key, ids: key ? parseArchivedEvents(localStorage.getItem(key)) : [] }); setError(''); }
      catch { setState({ key, ids: [] }); setError('Archive preferences are unavailable in this browser. Your event records are unchanged.'); }
    };
    read(); window.addEventListener('storage', read); window.addEventListener(CHANGED, read);
    return () => { window.removeEventListener('storage', read); window.removeEventListener(CHANGED, read); };
  }, [key]);
  function setArchived(event, archived) {
    if (!key || !CLOSED_EVENTS.includes(event.status)) return;
    try {
      // Read at the time of the edit so a different view's latest preference survives.
      const latest = parseArchivedEvents(localStorage.getItem(key));
      if (archived && !latest.includes(event.id) && latest.length >= 1000) { setError('This browser has reached its archive limit. Restore an event before archiving another.'); return; }
      const ids = archived ? [...new Set([...latest, event.id])] : latest.filter(id => id !== event.id);
      localStorage.setItem(key, JSON.stringify(ids));
      setState({ key, ids }); setError(''); window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }));
    } catch { setError('Could not save this archive preference. Your event records are unchanged.'); }
  }
  return { archivedIds: state.key === key ? state.ids : [], setArchived, error };
}
