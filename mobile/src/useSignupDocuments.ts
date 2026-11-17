import { useEffect, useState } from 'react';
import { external } from './api/runtime';

type SignupDocument = {
  kind: 'terms' | 'privacy';
  version: string;
  hash: string;
  body: string;
  effectiveFrom: string;
};

type DocumentState = {
  documents?: SignupDocument[];
  required?: boolean;
  loading?: boolean;
  error?: boolean;
};

export function useSignupDocuments(accountType: 'CUSTOMER' | 'VENDOR' | null, revision = 0) {
  const [state, setState] = useState<DocumentState>({ loading: true });

  useEffect(() => {
    if (!accountType) return;
    let current = true;
    setState({ loading: true });
    external.call(`/auth/signup-documents?accountType=${accountType}`)
      .then(data => {
        if (current) setState({ required: data.required, documents: data.documents });
      })
      .catch(() => {
        if (current) setState({ error: true });
      });
    return () => { current = false; };
  }, [accountType, revision]);

  return state;
}
