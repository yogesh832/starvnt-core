import { useEffect, useState } from 'react';
import { externalApi } from './api.js';

export function useSignupDocuments(accountType, revision = 0) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!accountType) return;
    let current = true;
    setState({ loading: true });
    externalApi.call(`/auth/signup-documents?accountType=${accountType}`)
      .then(data => {
        if (current) setState(data);
      })
      .catch(() => {
        if (current) setState({ error: true });
      });
    return () => { current = false; };
  }, [accountType, revision]);

  return state;
}
