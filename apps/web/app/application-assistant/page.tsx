'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ───────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  ts: number;
  agent: string;
  level: string;
  message: string;
  detail?: string;
}

interface StatusResponse {
  running: boolean;
  sessionId: string | null;
  currentStep: string;
  analysisId: string | null;
  waitingForLogin: boolean;
  waitingForCaptcha: boolean;
}

interface JobSummary {
  title: string;
  company: string;
  companyOneLiner: string | null;
  location: string | null;
  salary: string | null;
  description: string;
  requirements: string[];
  postedDate: string | null;
  deadline: string | null;
  employmentType: string | null;
  remoteType: string | null;
  seniority: string | null;
  department: string | null;
}

interface MatchBreakdown {
  skills: number;
  experience: number;
  location: number;
  seniority: number;
  education: number;
}

interface ResumeSuggestions {
  matches: string[];
  improvements: string[];
  keywordsToAdd: string[];
}

interface ChecklistItem {
  item: string;
  done: boolean;
}

interface StrictFilterReject {
  dimension: string;
  reason: string;
}

interface Analysis {
  id: string;
  url: string;
  jobSummary: JobSummary | null;
  matchScore: number | null;
  matchGrade: string | null;
  matchRationale: string | null;
  matchBreakdown: MatchBreakdown | null;
  strictFilterRejects: StrictFilterReject[] | null;
  resumeSuggestions: ResumeSuggestions | null;
  coverLetters: { formal: string; conversational: string; bold: string } | null;
  contacts: {
    emails: string[];
    linkedIn: string[];
    others: { label: string; value: string }[];
  } | null;
  keywordsToAdd: string[] | null;
  salaryLevelCheck: string | null;
  applicationChecklist: ChecklistItem[] | null;
  interviewPrepBullets: string[] | null;
  companyResearch: string | null;
  companySnapshot?: Record<string, unknown> | null;
  matchEvidence?: Record<string, unknown> | null;
  resumeEvidence?: Record<string, unknown> | null;
  coverLettersEvidence?: Record<string, unknown> | null;
  contactsEvidence?: Record<string, unknown> | null;
  createdAt: string;
  runStatus?: string | null;
  runUpdatedAt?: string | null;
}

interface ApplicationAssistantPageProps {
  initialAnalysisId?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STEPS = ['scraping', 'extracting', 'matching', 'writing', 'done'] as const;

function stepIndex(step: string): number {
  const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
  return idx >= 0 ? idx : -1;
}

function formatTime(ts: number) {
  return new Date(ts).toTimeString().slice(0, 8);
}

/** Renders the full company snapshot from DB (all fields in a small card). */
function CompanySnapshotCard({
  snapshot,
  jobLocation,
}: {
  snapshot: Record<string, unknown>;
  jobLocation: string | null;
}) {
  const name = (snapshot.name as string) ?? '';
  const descriptionText = (snapshot.descriptionText as string) ?? null;
  const url = (snapshot.url as string) ?? null;
  const industries = snapshot.industries as string[] | null | undefined;
  const hqLocation = (snapshot.hqLocation as string) ?? null;
  const sizeRange = (snapshot.sizeRange as string) ?? null;
  const foundedYear = snapshot.foundedYear as number | null | undefined;
  const fundingStage = (snapshot.fundingStage as string) ?? null;
  const publicCompany = snapshot.publicCompany as boolean | null | undefined;
  const ticker = (snapshot.ticker as string) ?? null;
  const remotePolicy = (snapshot.remotePolicy as string) ?? null;
  const hiringLocations = snapshot.hiringLocations as string[] | null | undefined;
  const techStackHints = snapshot.techStackHints as string[] | null | undefined;
  const jobCountTotal = snapshot.jobCountTotal as number | null | undefined;
  const jobCountOpen = snapshot.jobCountOpen as number | null | undefined;
  const websiteDomain = (snapshot.websiteDomain as string) ?? null;

  const label = (str: string) => (
    <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginBottom: 2 }}>
      {str}
    </span>
  );
  const row = (l: string, v: React.ReactNode) =>
    v != null && v !== '' && v !== false ? (
      <div key={l} style={{ marginBottom: '0.5rem' }}>
        {label(l)}
        <div style={{ fontSize: '0.85rem' }}>{v}</div>
      </div>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{name}</div>
          {jobLocation && (
            <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: 2 }}>
              Job location: {jobLocation}
            </div>
          )}
          {url && (
            <a
              href={url.startsWith('http') ? url : `https://${url}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.8rem',
                color: 'var(--accent)',
                marginTop: 4,
                display: 'inline-block',
              }}
            >
              {websiteDomain || url}
            </a>
          )}
        </div>
        {descriptionText && (
          <div style={{ minWidth: 0, flex: '1 1 280px' }}>
            {label('About')}
            <p style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.45 }}>{descriptionText}</p>
          </div>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '0.75rem 1rem',
          fontSize: '0.8rem',
        }}
      >
        {row('Industries', industries?.length ? industries.join(', ') : null)}
        {row('HQ', hqLocation)}
        {row('Size', sizeRange)}
        {foundedYear != null && row('Founded', String(foundedYear))}
        {row('Funding', fundingStage)}
        {publicCompany === true && row('Public', ticker ? `${ticker} (public)` : 'Yes')}
        {row('Remote policy', remotePolicy)}
        {hiringLocations?.length
          ? row(
              'Hiring locations',
              hiringLocations.slice(0, 5).join(', ') + (hiringLocations.length > 5 ? '…' : ''),
            )
          : null}
        {techStackHints?.length
          ? row(
              'Tech stack',
              techStackHints.slice(0, 6).join(', ') + (techStackHints.length > 6 ? '…' : ''),
            )
          : null}
        {jobCountOpen != null && jobCountOpen > 0
          ? row('Open roles', String(jobCountOpen))
          : jobCountTotal != null && jobCountTotal > 0
            ? row('Roles', String(jobCountTotal))
            : null}
      </div>
    </div>
  );
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
      return 'var(--muted-foreground)';
  }
}

function scoreColor(score: number) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ApplicationAssistantPage({
  initialAnalysisId,
}: ApplicationAssistantPageProps = {}) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const [coverTab, setCoverTab] = useState<'formal' | 'conversational' | 'bold'>('formal');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [autoConfirmCompanyTitle, setAutoConfirmCompanyTitle] = useState(false);
  const [companyManuallyConfirmed, setCompanyManuallyConfirmed] = useState(false);
  const [historySortBy, setHistorySortBy] = useState<'date' | 'score' | 'company'>('date');
  const [historySortDir, setHistorySortDir] = useState<'asc' | 'desc'>('desc');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 5;
  const [feedbackList, setFeedbackList] = useState<{ component: string; value: string }[]>([]);

  // Poll status (from DB: running state and progress persist across refresh/tabs)
  useEffect(() => {
    const poll = () => {
      fetch('/api/application-assistant/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setStatus(d as StatusResponse))
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, []);

  // Poll logs (from DB by analysisId so they persist across tabs/refresh)
  const logsAnalysisId = status?.analysisId ?? analysis?.id;
  const showLogs =
    status?.running ||
    status?.currentStep === 'done' ||
    status?.currentStep === 'error' ||
    analysis?.id;
  useEffect(() => {
    if (!showLogs || !logsAnalysisId) return;
    const poll = () => {
      const params = new URLSearchParams({ analysisId: logsAnalysisId });
      if (lastLogId) params.set('after', lastLogId);
      fetch(`/api/application-assistant/logs?${params}`)
        .then((r) => (r.ok ? r.json() : { logs: [] }))
        .then((d) => {
          const newLogs = (d.logs || []) as LogEntry[];
          if (newLogs.length > 0) {
            setLogs((prev) => {
              const ids = new Set(prev.map((l) => l.id));
              const added = newLogs.filter((l) => !ids.has(l.id));
              return [...prev, ...added];
            });
            const last = newLogs[newLogs.length - 1];
            if (last) setLastLogId(last.id);
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 800);
    return () => clearInterval(interval);
  }, [showLogs, logsAnalysisId, lastLogId]);

  // When we have an analysis to show logs for and no logs yet, fetch full log buffer once
  useEffect(() => {
    if (!showLogs || !logsAnalysisId || logs.length > 0) return;
    fetch(`/api/application-assistant/logs?analysisId=${logsAnalysisId}`)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => {
        const allLogs = (d.logs || []) as LogEntry[];
        if (allLogs.length > 0) {
          setLogs(allLogs);
          const last = allLogs[allLogs.length - 1];
          if (last) setLastLogId(last.id);
        }
      })
      .catch(() => {});
  }, [showLogs, logsAnalysisId, logs.length]);

  // Fetch analysis when analysisId appears or step becomes done
  useEffect(() => {
    if (!status?.analysisId) return;
    const load = () => {
      fetch(`/api/application-assistant/analyses/${status.analysisId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setAnalysis(d))
        .catch(() => {});
    };
    load();
    if (status.running) {
      const interval = setInterval(load, 3000);
      return () => clearInterval(interval);
    }
  }, [status?.analysisId, status?.running, status?.currentStep]);

  // Fetch feedback when we have an analysis to show
  useEffect(() => {
    const id = analysis?.id ?? status?.analysisId;
    if (!id) {
      setFeedbackList([]);
      return;
    }
    fetch(`/api/application-assistant/feedback?analysisId=${id}`)
      .then((r) => (r.ok ? r.json() : { feedback: [] }))
      .then((d) => setFeedbackList(d.feedback ?? []))
      .catch(() => setFeedbackList([]));
  }, [analysis?.id, status?.analysisId]);

  // Scroll terminal
  useEffect(() => {
    terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
  }, [logs]);

  // When opening the terminal, scroll its own viewport to the bottom (without scrolling the page)
  useEffect(() => {
    if (!terminalOpen) return;
    terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
  }, [terminalOpen, logs.length]);

  // Load auto-confirm preference from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('aa_auto_confirm_company_title');
      if (stored === '1') setAutoConfirmCompanyTitle(true);
    } catch {
      // ignore
    }
  }, []);

  // Load history
  const loadHistory = useCallback(() => {
    fetch('/api/application-assistant/analyses')
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((d) => {
        setHistory(d.analyses || []);
        setHistoryPage(1);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reload history when analysis completes or when a live analysis id appears (so list shows it)
  useEffect(() => {
    if (status?.currentStep === 'done') loadHistory();
  }, [status?.currentStep, loadHistory]);
  useEffect(() => {
    if (status?.analysisId) loadHistory();
  }, [status?.analysisId, loadHistory]);

  const handleStart = async () => {
    if (!url.trim()) return;
    setStarting(true);
    setLogs([]);
    setLastLogId(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/application-assistant/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || 'Failed to start');
        return;
      }
      // Use status from the same process that set running=true (avoids wrong state from a second GET)
      setStatus({
        running: data.running ?? true,
        sessionId: data.sessionId ?? null,
        currentStep: data.currentStep ?? 'scraping',
        analysisId: data.analysisId ?? null,
        waitingForLogin: data.waitingForLogin ?? false,
        waitingForCaptcha: data.waitingForCaptcha ?? false,
      });
    } catch {
      alert('Failed to start analysis');
    } finally {
      setStarting(false);
    }
  };

  const handleLoginSolved = async () => {
    await fetch('/api/application-assistant/login-solved', { method: 'POST' });
  };

  const handleCaptchaSolved = async () => {
    await fetch('/api/application-assistant/captcha-solved', { method: 'POST' });
  };

  const handleStop = async () => {
    await fetch('/api/application-assistant/stop', { method: 'POST' });
  };

  // If we land on /application-assistant/[id], hydrate that analysis once (no live run)
  useEffect(() => {
    if (!initialAnalysisId) return;
    if (analysis && analysis.id === initialAnalysisId) return;
    if (status?.running) return;
    fetch(`/api/application-assistant/analyses/${initialAnalysisId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAnalysis(d as Analysis);
        setUrl(d.url);
        setShowHistory(false);
      })
      .catch(() => {});
  }, [initialAnalysisId, status?.running, analysis?.id]);

  const handleDeleteAnalysis = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/application-assistant/analyses/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setHistory((prev) => prev.filter((x) => x.id !== id));
      setAnalysis((prev) => (prev?.id === id ? null : prev));
    } catch {
      // ignore
    }
  };

  const handleDeleteAllAnalyses = async () => {
    if (!history.length || !confirm('Delete all past analyses? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/application-assistant/analyses', { method: 'DELETE' });
      if (!res.ok) return;
      setHistory([]);
      setAnalysis(null);
      setHistoryPage(1);
    } catch {
      // ignore
    }
  };

  const sortedHistory = [...history].sort((a, b) => {
    if (historySortBy === 'date') {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return historySortDir === 'asc' ? at - bt : bt - at;
    }
    if (historySortBy === 'score') {
      const as = a.matchScore ?? -Infinity;
      const bs = b.matchScore ?? -Infinity;
      return historySortDir === 'asc' ? as - bs : bs - as;
    }
    // company
    const an = ((a.jobSummary as JobSummary | null)?.company || '').toLowerCase();
    const bn = ((b.jobSummary as JobSummary | null)?.company || '').toLowerCase();
    const cmp = an.localeCompare(bn);
    return historySortDir === 'asc' ? cmp : -cmp;
  });

  const historyTotalPages = Math.max(1, Math.ceil((sortedHistory.length || 0) / HISTORY_PAGE_SIZE));
  const historyCurrentPage = Math.min(historyPage, historyTotalPages);
  const historyStartIndex = (historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
  const historyPageItems = sortedHistory.slice(
    historyStartIndex,
    historyStartIndex + HISTORY_PAGE_SIZE,
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  const handleExport = () => {
    if (!analysis) return;
    const job = analysis.jobSummary;
    const lines: string[] = [];
    lines.push('Application Assistant — Analysis Export');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`URL: ${analysis.url}`);
    lines.push('');
    if (job) {
      lines.push(`=== JOB SUMMARY ===`);
      lines.push(`Title: ${job.title}`);
      lines.push(`Company: ${job.company}`);
      if (job.location) lines.push(`Location: ${job.location}`);
      if (job.salary) lines.push(`Salary: ${job.salary}`);
      if (job.employmentType) lines.push(`Type: ${job.employmentType}`);
      lines.push(`Description: ${job.description.slice(0, 500)}...`);
      lines.push('');
    }
    if (analysis.matchScore != null) {
      lines.push(`=== MATCH ===`);
      lines.push(`Score: ${analysis.matchScore}/100 (${analysis.matchGrade})`);
      lines.push('');
    }
    if (analysis.coverLetters) {
      lines.push('=== COVER LETTER (Formal) ===');
      lines.push(analysis.coverLetters.formal);
      lines.push('');
      lines.push('=== COVER LETTER (Conversational) ===');
      lines.push(analysis.coverLetters.conversational);
      lines.push('');
      lines.push('=== COVER LETTER (Bold) ===');
      lines.push(analysis.coverLetters.bold);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `application-assistant-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const isRunning = status?.running === true;
  const effectiveStep =
    isRunning && status?.currentStep
      ? status.currentStep
      : analysis?.runStatus === 'error'
        ? 'error'
        : analysis
          ? 'done'
          : 'idle';
  const currentStep = effectiveStep;
  const currentStepIdx = stepIndex(currentStep);

  const currentStepLabel =
    currentStep === 'scraping'
      ? 'Working: browser & page capture'
      : currentStep === 'extracting'
        ? 'Working: extracting job details'
        : currentStep === 'matching'
          ? 'Working: profile-to-job match'
          : currentStep === 'writing'
            ? 'Working: cover letters & prep'
            : currentStep === 'done'
              ? 'Pipeline finished'
              : currentStep === 'error'
                ? 'Pipeline failed'
                : 'Idle';

  // Derive a more precise "currently working" label from the latest log entry
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const currentAgentLabel =
    lastLog && isRunning ? `[${lastLog.agent}] ${lastLog.message}` : currentStepLabel;

  // Derive confidences from logs (CompanyResolver + CleanerVerifier)
  let companyConfidence = 100;
  let cleaningConfidence = 100;
  const resolverLog = [...logs]
    .reverse()
    .find((l) => l.agent === 'CompanyResolver' && l.message.includes('Resolved company'));
  if (resolverLog) {
    const m = resolverLog.message.match(/confidence\s+(\d+)%/i);
    if (m) companyConfidence = parseInt(m[1]!, 10);
  }
  const cleanerInitialLog = [...logs]
    .reverse()
    .find(
      (l) =>
        l.agent === 'CleanerVerifier' && l.message.toLowerCase().startsWith('cleaning confidence'),
    );
  if (cleanerInitialLog) {
    const m = cleanerInitialLog.message.match(/confidence:\s*(\d+)%/i);
    if (m) cleaningConfidence = parseInt(m[1]!, 10);
  }

  const mandatoryConfirmGate = companyConfidence < 40 || cleaningConfidence < 40;
  const canAutoSkipGate = companyConfidence >= 80 && cleaningConfidence >= 70;
  const autoSkipConfirmGate = autoConfirmCompanyTitle && canAutoSkipGate && !mandatoryConfirmGate;

  const viewingPastAnalysis = !!analysis && !isRunning;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-head">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <h1 style={{ margin: 0 }}>Application Assistant</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {viewingPastAnalysis && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}
                onClick={() => router.push('/application-assistant')}
              >
                New analysis
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}
              disabled={isRunning}
              title={
                isRunning
                  ? 'Analysis in progress — stop the analysis to access history.'
                  : undefined
              }
              onClick={() => {
                if (isRunning) return;
                setShowHistory(!showHistory);
                if (!showHistory) loadHistory();
              }}
            >
              {showHistory ? 'Hide History' : 'History'}
            </button>
            {analysis && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}
                onClick={handleExport}
              >
                Export
              </button>
            )}
          </div>
        </div>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Paste a job or application page URL. We&apos;ll open it in a browser (you can log in if
          needed), then show a job summary, how you match, resume tips, and cover letter drafts.
        </p>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Past Analyses
            </h2>
            {history.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  <span>Sort by</span>
                  <select
                    value={historySortBy}
                    onChange={(e) => {
                      setHistorySortBy(e.target.value as 'date' | 'score' | 'company');
                      setHistoryPage(1);
                    }}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 999,
                      padding: '0.25rem 0.5rem',
                      color: 'var(--text)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <option value="date">Date analyzed</option>
                    <option value="score">Score</option>
                    <option value="company">Company</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setHistorySortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '999px',
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--surface)',
                      color: 'var(--muted-foreground)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      lineHeight: 1,
                    }}
                    title={historySortDir === 'asc' ? 'Ascending order' : 'Descending order'}
                  >
                    {historySortDir === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.35rem 0.75rem',
                    color: 'var(--muted-foreground)',
                  }}
                  onClick={handleDeleteAllAnalyses}
                >
                  Delete all
                </button>
              </div>
            )}
          </div>
          {history.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', margin: 0 }}>
              No past analyses yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {historyPageItems.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '0.5rem',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background:
                      analysis?.id === h.id ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/application-assistant/${h.id}`)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      padding: '0.6rem 0.75rem',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      {(h as Analysis).runStatus === 'running' &&
                        (h as Analysis).runUpdatedAt &&
                        Date.now() - new Date((h as Analysis).runUpdatedAt!).getTime() <
                          5 * 60 * 1000 && (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'var(--accent)',
                              flexShrink: 0,
                            }}
                            title="Running now"
                          />
                        )}
                      {(h.jobSummary as JobSummary | null)?.title || 'Untitled'}{' '}
                      <span style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>
                        at {(h.jobSummary as JobSummary | null)?.company || '—'}
                      </span>
                    </div>
                    <div
                      style={{
                        color: 'var(--muted-foreground)',
                        fontSize: '0.75rem',
                        marginTop: '0.25rem',
                      }}
                    >
                      {new Date(h.createdAt).toLocaleString()} —{' '}
                      {(h as Analysis).runStatus === 'running'
                        ? 'Running…'
                        : h.matchScore != null
                          ? `${h.matchScore}/100`
                          : 'No match'}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteAnalysis(h.id, e)}
                    title="Delete this analysis"
                    aria-label="Delete this analysis"
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      alignSelf: 'center',
                      marginRight: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--muted-foreground)',
                      cursor: 'pointer',
                      fontSize: '1.125rem',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {history.length > HISTORY_PAGE_SIZE && (
            <div
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                justifyContent: 'center',
                gap: '0.35rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyCurrentPage === 1}
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background:
                    historyCurrentPage === 1 ? 'var(--surface)' : 'var(--surface-elevated)',
                  color: 'var(--muted-foreground)',
                  fontSize: '0.8rem',
                  cursor: historyCurrentPage === 1 ? 'default' : 'pointer',
                }}
              >
                ‹
              </button>
              {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setHistoryPage(page)}
                  style={{
                    minWidth: 28,
                    height: 28,
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background:
                      page === historyCurrentPage
                        ? 'var(--accent-muted)'
                        : 'var(--surface-elevated)',
                    color:
                      page === historyCurrentPage ? 'var(--accent)' : 'var(--muted-foreground)',
                    fontSize: '0.8rem',
                    cursor: page === historyCurrentPage ? 'default' : 'pointer',
                  }}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                disabled={historyCurrentPage === historyTotalPages}
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background:
                    historyCurrentPage === historyTotalPages
                      ? 'var(--surface)'
                      : 'var(--surface-elevated)',
                  color: 'var(--muted-foreground)',
                  fontSize: '0.8rem',
                  cursor: historyCurrentPage === historyTotalPages ? 'default' : 'pointer',
                }}
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* URL input */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <input
          className="input"
          type="url"
          placeholder="https://company.com/jobs/123-software-engineer"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleStart()}
          disabled={isRunning}
          style={{ flex: 1 }}
        />
        {isRunning ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleStop}
            style={{ whiteSpace: 'nowrap' }}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStart}
            disabled={starting || !url.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {starting ? 'Starting...' : 'Analyze'}
          </button>
        )}
      </div>

      {/* Progress stepper — show when run is active or when viewing an analysis we have logs for */}
      {(isRunning ||
        currentStep === 'done' ||
        currentStep === 'error' ||
        starting ||
        (analysis?.id && logsAnalysisId === analysis.id)) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            marginBottom: '1.25rem',
            overflowX: 'auto',
          }}
        >
          {STEPS.map((step, i) => {
            const isActive = currentStep === step;
            const isDone = currentStepIdx > i || currentStep === 'done';
            const isError = currentStep === 'error' && i === currentStepIdx;
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: isDone
                      ? 'var(--success)'
                      : isActive
                        ? 'var(--accent)'
                        : isError
                          ? 'var(--error)'
                          : 'var(--surface-elevated)',
                    color: isDone || isActive ? '#212529' : 'var(--muted-foreground)',
                    border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    flexShrink: 0,
                  }}
                >
                  {isError && isActive ? '\u2717' : isDone ? '\u2713' : i + 1}
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text)' : 'var(--muted-foreground)',
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                    animation:
                      isRunning && isActive ? 'pulse-opacity 1.1s ease-in-out infinite' : undefined,
                  }}
                >
                  {step}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      width: 30,
                      height: 2,
                      background:
                        currentStep === 'error' && i === currentStepIdx
                          ? 'var(--error)'
                          : isDone
                            ? 'var(--success)'
                            : 'var(--border)',
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Agent terminal — visible during a run or when viewing an analysis (logs from DB) */}
      {(isRunning ||
        currentStep === 'done' ||
        currentStep === 'error' ||
        starting ||
        (analysis?.id && logsAnalysisId === analysis.id)) && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isRunning ? (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px solid var(--accent)',
                    borderTopColor: 'transparent',
                    animation: 'spin 0.9s linear infinite',
                  }}
                />
              ) : currentStep === 'done' ? (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--success)',
                  }}
                />
              ) : null}
              <div>
                <h2
                  className="section-title"
                  style={{
                    margin: 0,
                    color: 'var(--accent)',
                    textTransform: 'none',
                    fontSize: '0.9rem',
                  }}
                >
                  Agent Terminal
                </h2>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--muted-foreground)',
                    marginTop: 2,
                    animation:
                      isRunning && currentStep !== 'idle'
                        ? 'pulse-opacity 1.1s ease-in-out infinite'
                        : undefined,
                  }}
                >
                  {currentAgentLabel}
                  {isRunning && currentStep !== 'idle' && '…'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {status?.waitingForLogin && (
                <button
                  type="button"
                  onClick={handleLoginSolved}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.4rem 0.85rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Logged in — Continue
                </button>
              )}
              {status?.waitingForCaptcha && (
                <button
                  type="button"
                  onClick={handleCaptchaSolved}
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.4rem 0.85rem',
                    whiteSpace: 'nowrap',
                    background: 'var(--success)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'opacity var(--transition)',
                  }}
                >
                  Captcha solved — Continue
                </button>
              )}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Automatically skip company/title confirmation when confidence is high."
              >
                <input
                  type="checkbox"
                  checked={autoConfirmCompanyTitle}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoConfirmCompanyTitle(checked);
                    setCompanyManuallyConfirmed(false);
                    if (typeof window !== 'undefined') {
                      try {
                        window.localStorage.setItem(
                          'aa_auto_confirm_company_title',
                          checked ? '1' : '0',
                        );
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  style={{ transform: 'scale(0.95)' }}
                />
                Auto-confirm title &amp; company
              </label>
              <button
                type="button"
                onClick={() => setTerminalOpen((open) => !open)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '0.15rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label={terminalOpen ? 'Hide agent terminal' : 'Show agent terminal'}
              >
                <span
                  style={{
                    display: 'inline-block',
                    transform: terminalOpen ? 'rotate(90deg)' : 'rotate(180deg)',
                    transition: 'transform 0.15s ease-out',
                    fontSize: '0.75rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  ▶
                </span>
              </button>
            </div>
          </div>
          {terminalOpen && (
            <div
              ref={terminalRef}
              style={{
                maxHeight: 280,
                overflow: 'auto',
                background: '#0d1117',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                fontSize: '0.75rem',
                lineHeight: 1.5,
                padding: '0.5rem 1rem 0.75rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--muted-foreground)' }}>
                  {starting ? 'Starting pipeline…' : 'Waiting for logs…'}
                </div>
              ) : (
                logs.map((l, idx) => {
                  const isLast = idx === logs.length - 1;
                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginBottom: '0.15rem',
                        animation:
                          isRunning && isLast
                            ? 'pulse-opacity 1.1s ease-in-out infinite'
                            : undefined,
                      }}
                    >
                      <span style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>
                        [{formatTime(l.ts)}]
                      </span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                        [{l.agent}]
                      </span>
                      <span style={{ color: levelColor(l.level) }}>{l.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick company snapshot (Phase 11) — full DB company when available */}
      {analysis?.jobSummary && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Company Snapshot
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--muted-foreground)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    isRunning && currentStepIdx < stepIndex('matching')
                      ? 'var(--accent)'
                      : 'var(--success)',
                }}
              />
              <span>
                {isRunning && currentStepIdx < stepIndex('matching')
                  ? 'Building snapshot…'
                  : 'Snapshot ready'}
              </span>
            </div>
          </div>
          {analysis.companySnapshot ? (
            <CompanySnapshotCard
              snapshot={analysis.companySnapshot}
              jobLocation={analysis.jobSummary.location}
            />
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--muted-foreground)',
                      marginBottom: 2,
                    }}
                  >
                    Company
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                    }}
                  >
                    {analysis.jobSummary.company}
                  </div>
                  {analysis.jobSummary.location && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--muted-foreground)',
                        marginTop: 2,
                      }}
                    >
                      {analysis.jobSummary.location}
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 2 }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--muted-foreground)',
                      marginBottom: 2,
                    }}
                  >
                    Snapshot
                  </div>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      margin: 0,
                      maxHeight: 60,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={
                      analysis.companyResearch ?? analysis.jobSummary.companyOneLiner ?? undefined
                    }
                  >
                    {analysis.companyResearch
                      ? analysis.companyResearch.slice(0, 220)
                      : (analysis.jobSummary.companyOneLiner ??
                        'We will enrich this company profile over time.')}
                  </p>
                </div>
              </div>
            </>
          )}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              fontSize: '0.75rem',
            }}
          >
            <div
              style={{
                padding: '0.35rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              title={resolverLog?.message}
            >
              <span style={{ fontWeight: 500 }}>Identity</span>
              <span>{companyConfidence}%</span>
            </div>
            <div
              style={{
                padding: '0.35rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              title={cleanerInitialLog?.message}
            >
              <span style={{ fontWeight: 500 }}>Cleaning</span>
              <span>{cleaningConfidence}%</span>
            </div>
            <div
              style={{
                padding: '0.35rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              title="Deep company dossier will run as a background step in a future phase."
            >
              <span style={{ fontWeight: 500 }}>Deep dossier</span>
              <span>Queued</span>
            </div>
          </div>
        </div>
      )}

      {/* Company/title confirmation gate (Phase 10) */}
      {analysis?.jobSummary && !autoSkipConfirmGate && !companyManuallyConfirmed && (
        <div
          className="card"
          style={{
            marginBottom: '1.5rem',
            borderLeft: mandatoryConfirmGate
              ? '3px solid var(--danger)'
              : '3px solid var(--warning)',
          }}
        >
          <h2 className="section-title" style={{ margin: '0 0 0.5rem 0' }}>
            Confirm job title &amp; company
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: 0 }}>
            We detected the following from the job page. Please confirm before we rely on it for
            company research and matching.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                  marginBottom: 2,
                }}
              >
                Title
              </div>
              <div
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.85rem',
                }}
              >
                {analysis.jobSummary!.title}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                  marginBottom: 2,
                }}
              >
                Company
              </div>
              <div
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.85rem',
                }}
              >
                {analysis.jobSummary!.company}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--muted-foreground)',
              }}
            >
              Resolver confidence: {companyConfidence}% · Cleaning confidence: {cleaningConfidence}%{' '}
              {mandatoryConfirmGate && (
                <span style={{ color: 'var(--danger)', fontWeight: 500 }}>
                  (Manual confirmation required)
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
              onClick={() => setCompanyManuallyConfirmed(true)}
            >
              Looks correct — continue
            </button>
          </div>
        </div>
      )}

      {/* Job summary */}
      {analysis?.jobSummary && <JobSummaryCard job={analysis.jobSummary as JobSummary} />}

      {/* Company research */}
      {analysis?.companyResearch && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ margin: '0 0 0.5rem 0' }}>
            Company Research
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {analysis.companyResearch}
          </p>
        </div>
      )}

      {/* Match score */}
      {analysis?.matchScore != null && analysis.matchBreakdown && (
        <>
          <MatchCard
            score={analysis.matchScore}
            grade={analysis.matchGrade || 'N/A'}
            rationale={analysis.matchRationale ?? undefined}
            breakdown={analysis.matchBreakdown as MatchBreakdown}
            matchEvidence={analysis.matchEvidence ?? undefined}
            analysisId={analysis.id}
            feedbackValue={
              (feedbackList?.find((f) => f.component === 'match')?.value as 'up' | 'down') ?? null
            }
            onFeedbackSubmitted={setFeedbackList}
          />
          {analysis.strictFilterRejects && analysis.strictFilterRejects.length > 0 && (
            <StrictFilterRejectsSection rejects={analysis.strictFilterRejects} />
          )}
        </>
      )}

      {/* No profile message */}
      {analysis && analysis.matchScore == null && !isRunning && currentStep !== 'idle' && (
        <div
          className="card"
          style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--warning)' }}
        >
          <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
            Add a <strong>profile</strong> and <strong>resume</strong> from your Dashboard for
            personalized match scoring, resume suggestions, and cover letter generation.
          </p>
        </div>
      )}

      {/* Resume suggestions */}
      {analysis?.resumeSuggestions && (
        <ResumeSuggestionsCard
          suggestions={analysis.resumeSuggestions as ResumeSuggestions}
          keywords={analysis.keywordsToAdd}
          resumeEvidence={analysis.resumeEvidence ?? undefined}
        />
      )}

      {/* Cover letters */}
      {analysis?.coverLetters && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Cover Letters
            </h2>
            <EvidenceInfoIcon
              evidence={analysis.coverLettersEvidence ?? undefined}
              cardTitle="Cover Letters"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['formal', 'conversational', 'bold'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setCoverTab(style)}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: coverTab === style ? 600 : 400,
                  background: coverTab === style ? 'var(--accent-muted)' : 'transparent',
                  color: coverTab === style ? 'var(--accent)' : 'var(--muted-foreground)',
                  border: '1px solid',
                  borderColor: coverTab === style ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {style}
              </button>
            ))}
          </div>
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '1rem',
              fontSize: '0.875rem',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)',
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            {analysis.coverLetters[coverTab]}
          </div>
          <div
            style={{
              marginTop: '0.5rem',
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => copyToClipboard(analysis.coverLetters![coverTab], coverTab)}
            >
              {copyFeedback === coverTab ? 'Copied!' : 'Copy to clipboard'}
            </button>
            <FeedbackThumbs
              analysisId={analysis.id}
              component="outreach"
              feedbackValue={
                (feedbackList?.find((f) => f.component === 'outreach')?.value as 'up' | 'down') ??
                null
              }
              onFeedbackSubmitted={setFeedbackList}
            />
          </div>
        </div>
      )}

      {/* Contacts placeholder */}
      {analysis &&
        analysis.contacts &&
        ((analysis.contacts.emails && analysis.contacts.emails.length > 0) ||
          (analysis.contacts.linkedIn && analysis.contacts.linkedIn.length > 0) ||
          (analysis.contacts.others && analysis.contacts.others.length > 0)) && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <h2 className="section-title" style={{ margin: 0 }}>
                Contacts
              </h2>
              <EvidenceInfoIcon
                evidence={analysis.contactsEvidence ?? undefined}
                cardTitle="Contacts"
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {['Email', 'LinkedIn', 'Other'].map((label) => (
                <div
                  key={label}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg)',
                    border: '1px dashed var(--border)',
                    borderRadius: 6,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                    {label}
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                    Coming soon
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <FeedbackThumbs
                analysisId={analysis.id}
                component="contact"
                feedbackValue={
                  (feedbackList?.find((f) => f.component === 'contact')?.value as 'up' | 'down') ??
                  null
                }
                onFeedbackSubmitted={setFeedbackList}
              />
            </div>
          </div>
        )}

      {/* Extras: Salary check, Checklist, Interview prep */}
      {analysis?.salaryLevelCheck && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ margin: '0 0 0.5rem 0' }}>
            Salary / Level Check
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {analysis.salaryLevelCheck}
          </p>
        </div>
      )}

      {analysis?.applicationChecklist && analysis.applicationChecklist.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setChecklistOpen(!checklistOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Application Checklist
            </h2>
            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
              {checklistOpen ? 'Collapse' : 'Expand'}
            </span>
          </button>
          {checklistOpen && (
            <div
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              {analysis.applicationChecklist.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span style={{ color: item.done ? 'var(--success)' : 'var(--muted-foreground)' }}>
                    {item.done ? '\u2713' : '\u25CB'}
                  </span>
                  <span style={{ color: item.done ? 'var(--text-secondary)' : 'var(--text)' }}>
                    {item.item}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {analysis?.interviewPrepBullets && analysis.interviewPrepBullets.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setInterviewOpen(!interviewOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Interview Prep
            </h2>
            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
              {interviewOpen ? 'Collapse' : 'Expand'}
            </span>
          </button>
          {interviewOpen && (
            <div
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {analysis.interviewPrepBullets.map((bullet, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.6rem 0.75rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {bullet}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 16: Outreach section (placeholder until OutReachPipeline is built) */}
      {analysis && (analysis.runStatus === 'done' || status?.currentStep === 'done') && (
        <>
          <div
            className="card"
            style={{
              marginBottom: '1rem',
              borderLeft: '4px solid var(--accent)',
              background: 'var(--surface-elevated)',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <strong>OutReachPipeline</strong> has started. Yet to build.
            </p>
          </div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ margin: '0 0 0.75rem 0' }}>
              Outreach
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
              Multi-channel outreach (LinkedIn, email) will appear here once the OutReachPipeline is
              built.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function JobSummaryCard({ job }: { job: JobSummary }) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 className="section-title" style={{ margin: '0 0 0.75rem 0' }}>
        Job Summary
      </h2>
      <div style={{ marginBottom: '0.75rem' }}>
        <div
          style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}
        >
          {job.title}
        </div>
        <div
          style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}
        >
          {job.company}
          {job.companyOneLiner && (
            <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              {' '}
              — {job.companyOneLiner}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {job.location && <InfoPill label="Location" value={job.location} />}
        {job.salary && <InfoPill label="Pay" value={job.salary} />}
        {job.employmentType && <InfoPill label="Type" value={job.employmentType} />}
        {job.remoteType && <InfoPill label="Remote" value={job.remoteType} />}
        {job.seniority && <InfoPill label="Level" value={job.seniority} />}
        {job.department && <InfoPill label="Dept" value={job.department} />}
        {job.postedDate && <InfoPill label="Posted" value={job.postedDate} />}
        {job.deadline && <InfoPill label="Deadline" value={job.deadline} />}
      </div>

      {job.description && (
        <div
          style={{
            fontSize: '0.8125rem',
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            maxHeight: 200,
            overflow: 'auto',
            background: 'var(--bg)',
            borderRadius: 6,
            padding: '0.75rem',
            border: '1px solid var(--border)',
          }}
        >
          {job.description.slice(0, 1500)}
          {job.description.length > 1500 && '...'}
        </div>
      )}

      {job.requirements.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              marginBottom: '0.35rem',
              textTransform: 'uppercase',
            }}
          >
            Requirements
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {job.requirements.slice(0, 10).map((req, i) => (
              <span
                key={i}
                style={{
                  padding: '0.2rem 0.5rem',
                  background: 'var(--surface-elevated)',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {req}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.25rem 0.6rem',
        background: 'var(--surface-elevated)',
        borderRadius: 999,
        fontSize: '0.75rem',
      }}
    >
      <span style={{ color: 'var(--muted-foreground)' }}>{label}:</span>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/** Renders an info icon that shows Evidence modal on hover. Only renders if evidence is present. */
function EvidenceInfoIcon({
  evidence,
  cardTitle,
}: {
  evidence: Record<string, unknown> | null | undefined;
  cardTitle: string;
}) {
  const [hover, setHover] = useState(false);
  if (!evidence || Object.keys(evidence).length === 0) return null;
  const lines: string[] = [];
  if (typeof evidence.model === 'string') lines.push(`Model: ${evidence.model}`);
  if (typeof evidence.summary === 'string') lines.push(evidence.summary);
  Object.entries(evidence).forEach(([k, v]) => {
    if (k === 'model' || k === 'summary') return;
    if (Array.isArray(v)) lines.push(`${k}: ${v.length} item(s)`);
    else if (v !== null && typeof v === 'object')
      lines.push(`${k}: ${JSON.stringify(v).slice(0, 80)}...`);
    else if (v != null) lines.push(`${k}: ${String(v)}`);
  });
  return (
    <span
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--surface-elevated)',
          color: 'var(--muted-foreground)',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'help',
        }}
        title="Evidence"
      >
        i
      </span>
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            padding: '0.75rem 1rem',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 220,
            maxWidth: 360,
            maxHeight: 320,
            overflow: 'auto',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text)' }}>
            Evidence — {cardTitle}
          </div>
          {lines.join('\n')}
        </div>
      )}
    </span>
  );
}

function FeedbackThumbs({
  analysisId,
  component,
  feedbackValue,
  onFeedbackSubmitted,
}: {
  analysisId: string;
  component: 'match' | 'contact' | 'outreach' | 'overall';
  feedbackValue?: 'up' | 'down' | null;
  onFeedbackSubmitted?: (list: { component: string; value: string }[]) => void;
}) {
  const [sending, setSending] = useState(false);
  const submit = async (value: 'up' | 'down') => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/application-assistant/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, component, value }),
      });
      const data = await res.json();
      if (res.ok && data.feedback && onFeedbackSubmitted) onFeedbackSubmitted(data.feedback);
    } finally {
      setSending(false);
    }
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        fontSize: '0.75rem',
        color: 'var(--muted-foreground)',
      }}
    >
      Helpful?
      <button
        type="button"
        onClick={() => submit('up')}
        disabled={sending}
        title="Yes"
        style={{
          padding: '0.2rem 0.4rem',
          border: `1px solid ${feedbackValue === 'up' ? 'var(--accent)' : 'var(--border)'}`,
          background: feedbackValue === 'up' ? 'var(--accent-muted)' : 'transparent',
          color: feedbackValue === 'up' ? 'var(--accent)' : 'var(--muted-foreground)',
          borderRadius: 6,
          cursor: sending ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
        }}
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => submit('down')}
        disabled={sending}
        title="No"
        style={{
          padding: '0.2rem 0.4rem',
          border: `1px solid ${feedbackValue === 'down' ? 'var(--warning)' : 'var(--border)'}`,
          background: feedbackValue === 'down' ? 'rgba(234,179,8,0.15)' : 'transparent',
          color: feedbackValue === 'down' ? 'var(--warning)' : 'var(--muted-foreground)',
          borderRadius: 6,
          cursor: sending ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
        }}
      >
        👎
      </button>
    </span>
  );
}

function StrictFilterRejectsSection({ rejects }: { rejects: StrictFilterReject[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="card"
      style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--warning)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 0,
          border: 'none',
          background: 'none',
          color: 'var(--text)',
          fontSize: '0.9375rem',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>Rejected by strict filter ({rejects.length})</span>
        <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open && (
        <ul
          style={{
            margin: '0.75rem 0 0 0',
            paddingLeft: '1.25rem',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          {rejects.map((r, i) => (
            <li key={i}>
              <strong>{r.dimension}:</strong> {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchCard({
  score,
  grade,
  rationale,
  breakdown,
  matchEvidence,
  analysisId,
  feedbackValue,
  onFeedbackSubmitted,
}: {
  score: number;
  grade: string;
  rationale?: string;
  breakdown: MatchBreakdown & { strengths?: string[]; gaps?: string[] };
  matchEvidence?: Record<string, unknown> | null;
  analysisId?: string;
  feedbackValue?: 'up' | 'down' | null;
  onFeedbackSubmitted?: (list: { component: string; value: string }[]) => void;
}) {
  const [sending, setSending] = useState(false);
  const color = scoreColor(score);
  const strengths = Array.isArray(breakdown.strengths) ? breakdown.strengths : [];
  const categories = [
    { label: 'Skills', value: breakdown.skills },
    { label: 'Experience', value: breakdown.experience },
    { label: 'Location', value: breakdown.location },
    { label: 'Seniority', value: breakdown.seniority },
    { label: 'Education', value: breakdown.education },
  ];
  const displayScore = Number.isFinite(score)
    ? (Math.round(score * 100) / 100).toFixed(2)
    : String(score);

  const submitFeedback = async (value: 'up' | 'down') => {
    if (!analysisId || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/application-assistant/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, component: 'match', value }),
      });
      const data = await res.json();
      if (res.ok && data.feedback && onFeedbackSubmitted) onFeedbackSubmitted(data.feedback);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          Profile Match
        </h2>
        <EvidenceInfoIcon evidence={matchEvidence} cardTitle="Profile Match" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
        {/* Score circle */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: `3px solid ${color}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color, lineHeight: 1 }}>
            {displayScore}
          </span>
          <span style={{ fontSize: '0.625rem', color: 'var(--muted-foreground)' }}>/100</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{grade}</div>
          <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
            {score >= 75 ? 'Strong match' : score >= 50 ? 'Moderate match' : 'Weak match'}
          </div>
          {rationale && (
            <p
              style={{
                margin: '0.5rem 0 0 0',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
              }}
            >
              {rationale}
            </p>
          )}
          {strengths.length > 0 && !rationale && (
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ fontWeight: 600 }}>Why you’re a strong fit:</span>{' '}
              <span>{strengths[0]}</span>
            </div>
          )}
          {analysisId && (
            <div
              style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                Help us improve:
              </span>
              <button
                type="button"
                onClick={() => submitFeedback('up')}
                disabled={sending}
                title="Good match"
                style={{
                  padding: '0.25rem 0.5rem',
                  border: `1px solid ${feedbackValue === 'up' ? 'var(--accent)' : 'var(--border)'}`,
                  background: feedbackValue === 'up' ? 'var(--accent-muted)' : 'transparent',
                  color: feedbackValue === 'up' ? 'var(--accent)' : 'var(--muted-foreground)',
                  borderRadius: 6,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                👍
              </button>
              <button
                type="button"
                onClick={() => submitFeedback('down')}
                disabled={sending}
                title="Poor match"
                style={{
                  padding: '0.25rem 0.5rem',
                  border: `1px solid ${feedbackValue === 'down' ? 'var(--warning)' : 'var(--border)'}`,
                  background: feedbackValue === 'down' ? 'rgba(234,179,8,0.15)' : 'transparent',
                  color: feedbackValue === 'down' ? 'var(--warning)' : 'var(--muted-foreground)',
                  borderRadius: 6,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                👎
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Breakdown bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {categories.map((cat) => (
          <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                width: 80,
                fontSize: '0.75rem',
                color: 'var(--muted-foreground)',
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {cat.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 8,
                background: 'var(--bg)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${cat.value}%`,
                  height: '100%',
                  background: scoreColor(cat.value),
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <span
              style={{
                width: 30,
                fontSize: '0.7rem',
                color: 'var(--muted-foreground)',
                textAlign: 'right',
              }}
            >
              {cat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumeSuggestionsCard({
  suggestions,
  keywords,
  resumeEvidence,
}: {
  suggestions: ResumeSuggestions;
  keywords: string[] | null;
  resumeEvidence?: Record<string, unknown> | null;
}) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          Resume Overview
        </h2>
        <EvidenceInfoIcon evidence={resumeEvidence} cardTitle="Resume Overview" />
      </div>

      {suggestions.matches.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--success)',
              marginBottom: '0.4rem',
            }}
          >
            What matches
          </div>
          {suggestions.matches.map((m, i) => (
            <div
              key={i}
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
                paddingLeft: '0.75rem',
                borderLeft: '2px solid var(--success)',
              }}
            >
              {m}
            </div>
          ))}
        </div>
      )}

      {suggestions.improvements.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--warning)',
              marginBottom: '0.4rem',
            }}
          >
            What to improve
          </div>
          {suggestions.improvements.map((m, i) => (
            <div
              key={i}
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
                paddingLeft: '0.75rem',
                borderLeft: '2px solid var(--warning)',
              }}
            >
              {m}
            </div>
          ))}
        </div>
      )}

      {(keywords ?? suggestions.keywordsToAdd ?? []).length > 0 && (
        <div>
          <div
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--accent)',
              marginBottom: '0.4rem',
            }}
          >
            Keywords to add (ATS)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {(keywords ?? suggestions.keywordsToAdd ?? []).map((kw, i) => (
              <span
                key={i}
                style={{
                  padding: '0.2rem 0.5rem',
                  background: 'var(--accent-muted)',
                  color: 'var(--accent)',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
