import { useCallback, useRef, useState } from 'react';

import type { MatchResponse } from '../../shared/api/client';
import { ApiError, postMatch } from '../../shared/api/client';

export type MatchQueryState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; response: MatchResponse }
  | { phase: 'failed'; message: string };

const REJECTED = 'the match service returned an error';
const UNREACHABLE = 'the match service could not be reached';

export function useMatchQuery(): {
  state: MatchQueryState;
  run: (query: string, customerId?: string) => void;
} {
  const [state, setState] = useState<MatchQueryState>({ phase: 'idle' });
  const pending = useRef<AbortController | null>(null);

  // A superseded request is aborted, so a slow answer can never replace a newer one.
  const run = useCallback((query: string, customerId?: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ phase: 'loading' });

    postMatch(customerId === undefined ? { query } : { query, customerId }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setState({ phase: 'ready', response });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'failed', message: error instanceof ApiError ? REJECTED : UNREACHABLE });
      });
  }, []);

  return { state, run };
}
