import { useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getMyLead } from '@/lib/admin-api';

const KEY = 'broker-check-submitted';
const EVENT = 'broker-check-submission';
const queryKey = ['consultation-submitted'];
const snapshot = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};
const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener('storage', notify);
  };
};

export function isDuplicateSubmission(error: unknown): boolean {
  const e = error as { status?: number; data?: { code?: string } } | null;
  return e?.status === 409 && e?.data?.code === 'ALREADY_SUBMITTED';
}

export function useSubmissionLock() {
  const client = useQueryClient();
  const persisted = useSyncExternalStore(subscribe, snapshot, () => false);
  const status = useQuery({
    queryKey,
    queryFn: async () => {
      try { await getMyLead(); return true; }
      catch (error) {
        if (error instanceof ApiError && error.status === 404) return false;
        throw error;
      }
    },
    enabled: !persisted,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const lock = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* Server still enforces it. */ }
    client.setQueryData(queryKey, true);
    window.dispatchEvent(new Event(EVENT));
  };
  return {
    submitted: persisted || status.data === true,
    checking: !persisted && status.isPending,
    lock,
  };
}
