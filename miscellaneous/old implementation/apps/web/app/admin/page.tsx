import { useEffect, useState, useRef } from 'react';
import { useAdminLogs } from '../components/AdminLogsContext';

type BlessedSource = {
  id: string;
  name: string;
  url: string;
  type: string;
  slug: string | null;
  enabledForScraping: boolean;
  scrapeIntervalMinutes: number | null;
  lastScrapedAt: string | null;
  lastScrapeStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function formatDateTime(ts: number) {
  return new Date(ts).toISOString();
}

type AgentLogEntry = import('../components/AdminLogsContext').AgentLogEntry;
type BrainLogEntry = import('../components/AdminLogsContext').BrainLogEntry;

function buildLogsSummary(brainLogs: BrainLogEntry[], agentLogs: AgentLogEntry[]): string {
  const lines: string[] = [];
  lines.push('CareerSignal Admin — Logs export');
  lines.push(`Generated: ${formatDateTime(Date.now())}`);
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('BRAIN ORCHESTRATOR LOGS');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  if (brainLogs.length === 0) {
    lines.push('(no brain logs)');
  } else {
    for (const l of brainLogs) {
      lines.push(`[${formatDateTime(l.ts)}] [${l.level}] ${l.message}`);
      if (l.reasoning) lines.push(`  Diagnosis: ${l.reasoning}`);
      if (l.recommendation) lines.push(`  Recommendation: ${l.recommendation}`);
      if (l.suggestedUrl) lines.push(`  Suggested URL: ${l.suggestedUrl}`);
      if (l.cycleDelaySeconds != null) lines.push(`  Next cycle in ${l.cycleDelaySeconds}s`);
      lines.push('');
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('AGENT TERMINAL LOGS');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  if (agentLogs.length === 0) {
    lines.push('(no agent logs)');
  } else {
    for (const l of agentLogs) {
      lines.push(`[${formatDateTime(l.ts)}] [${l.agent}] ${l.message}`);
      if (l.detail) lines.push(`  ${l.detail}`);
    }
  }

  return lines.join('\n');
}

function downloadLogs(brainLogs: BrainLogEntry[], agentLogs: AgentLogEntry[]) {
  const content = buildLogsSummary(brainLogs, agentLogs);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `careersignal-admin-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function levelColor(level: string) {
  switch (level) {
    case 'success':
      return '#22c55e';
    case 'warn':
      return '#eab308';
    case 'error':
      return '#ef4444';
    default:
      return 'var(--muted)';
  }
}

export default function AdminPage() {
  const {
    agentLogs: logs,
    brainLogs,
    lastAgentLogId,
    lastBrainLogId,
    appendAgentLogs,
    appendBrainLogs,
    clearLogs,
  } = useAdminLogs();

  const [sources, setSources] = useState<BlessedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [scrapingRunning, setScrapingRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [waitingForCaptchaSolve, setWaitingForCaptchaSolve] = useState(false);
  const [waitingForLogin, setWaitingForLogin] = useState(false);
  const [visibleMode, setVisibleMode] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const brainTerminalRef = useRef<HTMLDivElement>(null);

  const loadSources = () => {
    setLoading(true);
    fetch('/api/admin/blessed-sources')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  };

  const loadLogs = (afterId?: string) => {
    const url = afterId ? `/api/admin/logs?after=${afterId}` : '/api/admin/logs';
    fetch(url)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((data) => {
        const newLogs = (data.logs ||
          []) as import('../components/AdminLogsContext').AgentLogEntry[];
        if (newLogs.length > 0) appendAgentLogs(newLogs);
      })
      .catch(() => {});
  };

  const loadBrainLogs = (afterId?: string) => {
    const url = afterId ? `/api/admin/brain-logs?after=${afterId}` : '/api/admin/brain-logs';
    fetch(url)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((data) => {
        const newLogs = (data.logs ||
          []) as import('../components/AdminLogsContext').BrainLogEntry[];
        if (newLogs.length > 0) appendBrainLogs(newLogs);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    loadLogs(lastAgentLogId ?? undefined);
    loadBrainLogs(lastBrainLogId ?? undefined);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadLogs(lastAgentLogId ?? undefined), 800);
    return () => clearInterval(interval);
  }, [lastAgentLogId, appendAgentLogs]);

  useEffect(() => {
    const interval = setInterval(() => loadBrainLogs(lastBrainLogId ?? undefined), 1000);
    return () => clearInterval(interval);
  }, [lastBrainLogId, appendBrainLogs]);

  useEffect(() => {
    const loadStatus = () => {
      fetch('/api/admin/scrape/status')
        .then((r) => (r.ok ? r.json() : {}))
        .then(
          (data: {
            running?: boolean;
            waitingForCaptchaSolve?: boolean;
            waitingForLogin?: boolean;
          }) => {
            setScrapingRunning(data?.running === true);
            setWaitingForCaptchaSolve(data?.waitingForCaptchaSolve === true);
            setWaitingForLogin(data?.waitingForLogin === true);
          },
        )
        .catch(() => {});
    };
    loadStatus();
    const interval = setInterval(loadStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
  }, [logs]);

  useEffect(() => {
    brainTerminalRef.current?.scrollTo(0, brainTerminalRef.current.scrollHeight);
  }, [brainLogs]);

  const handleToggle = (id: string, enabled: boolean) => {
    setToggling(id);
    fetch(`/api/admin/blessed-sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_for_scraping: enabled }),
    })
      .then((r) => {
        if (r.ok) loadSources();
      })
      .finally(() => setToggling(null));
  };

  const handleRunScrape = () => {
    fetch('/api/admin/scrape/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: visibleMode }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setScrapingRunning(true);
          loadSources();
        }
      })
      .catch(() => {});
  };

  const handleCaptchaSolved = () => {
    fetch('/api/admin/scrape/captcha-solved', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setWaitingForCaptchaSolve(false);
      })
      .catch(() => {});
  };

  const handleLoggedIn = () => {
    fetch('/api/admin/scrape/login-solved', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setWaitingForLogin(false);
      })
      .catch(() => {});
  };

  const handleStopScrape = () => {
    setStopping(true);
    fetch('/api/admin/scrape/stop', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setScrapingRunning(false);
          clearLogs();
        }
      })
      .catch(() => {})
      .finally(() => setStopping(false));
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleString();
  };

  return (
    <div>
      {/* Original Admin UI preserved for reference */}
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Admin (Archived Implementation)</h1>
          <button
            type="button"
            onClick={() => downloadLogs(brainLogs, logs)}
            style={{
              fontSize: '0.875rem',
              padding: '0.4rem 0.75rem',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Download logs
          </button>
        </div>
        <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          Archived admin scrape UI (Planner/Brain + blessed sources). Kept here for reference only.
        </p>
      </div>
      {/* Rest of original component omitted for brevity in archive */}
      <p style={{ color: 'var(--muted)' }}>
        Full original implementation (terminals, blessed sources controls, etc.) lives in the git
        history. This archived file documents the high-level behavior.
      </p>
    </div>
  );

