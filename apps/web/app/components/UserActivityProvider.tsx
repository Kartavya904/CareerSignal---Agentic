'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface ActivityContextValue {
  reportAction: (type: string, payload?: Record<string, unknown>) => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

const BATCH_MS = 500;
const endpoint = '/api/session/activity';

function sendOne(type: string, payload: Record<string, unknown>) {
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});
}

export function UserActivityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const batchRef = useRef<{ type: string; payload: Record<string, unknown> }[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    const items = batchRef.current;
    batchRef.current = [];
    items.forEach(({ type, payload }) => sendOne(type, payload));
  }, []);

  const reportAction = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      batchRef.current.push({ type, payload: { ...payload } });
      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(flushBatch, BATCH_MS);
      }
    },
    [flushBatch],
  );

  useEffect(() => {
    if (pathname == null) return;
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      sendOne('route_change', { pathname });
    }
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      flushBatch();
    };
  }, [flushBatch]);

  return <ActivityContext.Provider value={{ reportAction }}>{children}</ActivityContext.Provider>;
}

export function useReportAction(): (type: string, payload?: Record<string, unknown>) => void {
  const ctx = useContext(ActivityContext);
  return ctx?.reportAction ?? (() => {});
}
