'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type AgentLogEntry = {
  id: string;
  ts: number;
  agent: string;
  level: string;
  message: string;
  detail?: string;
};

export type BrainLogEntry = {
  id: string;
  ts: number;
  level: string;
  message: string;
  reasoning?: string;
  recommendation?: string;
  suggestedUrl?: string;
  cycleDelaySeconds?: number;
};

type AdminLogsContextValue = {
  agentLogs: AgentLogEntry[];
  brainLogs: BrainLogEntry[];
  lastAgentLogId: string | null;
  lastBrainLogId: string | null;
  appendAgentLogs: (entries: AgentLogEntry[]) => void;
  appendBrainLogs: (entries: BrainLogEntry[]) => void;
  clearLogs: () => void;
};

const AdminLogsContext = createContext<AdminLogsContextValue | null>(null);

const MAX_AGENT_LOGS = 500;
const MAX_BRAIN_LOGS = 200;

export function AdminLogsProvider({ children }: { children: ReactNode }) {
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [brainLogs, setBrainLogs] = useState<BrainLogEntry[]>([]);
  const [lastAgentLogId, setLastAgentLogId] = useState<string | null>(null);
  const [lastBrainLogId, setLastBrainLogId] = useState<string | null>(null);

  const appendAgentLogs = useCallback((entries: AgentLogEntry[]) => {
    if (entries.length === 0) return;
    setAgentLogs((prev) => {
      const ids = new Set(prev.map((l) => l.id));
      const added = entries.filter((l) => !ids.has(l.id));
      const next = [...prev, ...added];
      if (next.length > MAX_AGENT_LOGS) return next.slice(-MAX_AGENT_LOGS);
      return next;
    });
    const last = entries[entries.length - 1];
    if (last) setLastAgentLogId(last.id);
  }, []);

  const appendBrainLogs = useCallback((entries: BrainLogEntry[]) => {
    if (entries.length === 0) return;
    setBrainLogs((prev) => {
      const ids = new Set(prev.map((l) => l.id));
      const added = entries.filter((l) => !ids.has(l.id));
      const next = [...prev, ...added];
      if (next.length > MAX_BRAIN_LOGS) return next.slice(-MAX_BRAIN_LOGS);
      return next;
    });
    const last = entries[entries.length - 1];
    if (last) setLastBrainLogId(last.id);
  }, []);

  const clearLogs = useCallback(() => {
    setAgentLogs([]);
    setBrainLogs([]);
    setLastAgentLogId(null);
    setLastBrainLogId(null);
  }, []);

  const value = useMemo<AdminLogsContextValue>(
    () => ({
      agentLogs,
      brainLogs,
      lastAgentLogId,
      lastBrainLogId,
      appendAgentLogs,
      appendBrainLogs,
      clearLogs,
    }),
    [
      agentLogs,
      brainLogs,
      lastAgentLogId,
      lastBrainLogId,
      appendAgentLogs,
      appendBrainLogs,
      clearLogs,
    ],
  );

  return <AdminLogsContext.Provider value={value}>{children}</AdminLogsContext.Provider>;
}

export function useAdminLogs(): AdminLogsContextValue {
  const ctx = useContext(AdminLogsContext);
  if (!ctx) {
    throw new Error('useAdminLogs must be used within AdminLogsProvider');
  }
  return ctx;
}
