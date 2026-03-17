'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '../components/ToastContext';

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
  userActionNeeded?: boolean;
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
  coverLetters: Record<string, string> | null;
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
  runSource?: string | null;
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
  const headquartersAndOffices = (snapshot.headquartersAndOffices as string) ?? null;
  const sizeRange = (snapshot.sizeRange as string) ?? null;
  const foundedYear = snapshot.foundedYear as number | null | undefined;
  const fundingStage = (snapshot.fundingStage as string) ?? null;
  const publicCompany = snapshot.publicCompany as boolean | null | undefined;
  const ticker = (snapshot.ticker as string) ?? null;
  const remotePolicy = (snapshot.remotePolicy as string) ?? null;
  const sponsorshipRate = snapshot.sponsorshipRate as string | null | undefined;
  const hiringProcessDescription = (snapshot.hiringProcessDescription as string) ?? null;
  const hiringLocations = snapshot.hiringLocations as string[] | null | undefined;
  const techStackHints = snapshot.techStackHints as string[] | null | undefined;
  const jobCountTotal = snapshot.jobCountTotal as number | null | undefined;
  const jobCountOpen = snapshot.jobCountOpen as number | null | undefined;
  const websiteDomain = (snapshot.websiteDomain as string) ?? null;
  const careersUrl = (snapshot.careersUrl as string) ?? null;
  const linkedinUrl = (snapshot.linkedinUrl as string) ?? null;

  const label = (str: string) => (
    <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginBottom: 2 }}>
      {str}
    </span>
  );
  const cell = (l: string, v: React.ReactNode) =>
    v != null && v !== '' && v !== false ? (
      <div key={l} style={{ marginBottom: '0.5rem' }}>
        {label(l)}
        <div style={{ fontSize: '0.85rem' }}>{v}</div>
      </div>
    ) : null;
  const fullRow = (l: string, v: React.ReactNode) =>
    v != null && v !== '' && v !== false ? (
      <div key={l} style={{ marginBottom: '0.75rem' }}>
        {label(l)}
        <div style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>{v}</div>
      </div>
    ) : null;

  const hiringLocationsStr = hiringLocations?.length
    ? hiringLocations.slice(0, 5).join(', ') + (hiringLocations.length > 5 ? '…' : '')
    : null;

  const sponsorshipDisplay =
    sponsorshipRate && sponsorshipRate !== ''
      ? sponsorshipRate === 'H1B_YES'
        ? 'H1B yes'
        : sponsorshipRate === 'CITIZEN_OR_RESIDENT_ONLY'
          ? 'Citizen / resident only'
          : sponsorshipRate
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {descriptionText && (
        <div style={{ minWidth: 0 }}>
          {label('About')}
          <p style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.45 }}>{descriptionText}</p>
        </div>
      )}
      {/* Row 1: Founded, HQ, Hiring locations, Sponsorship (H1B) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.75rem 1rem',
          fontSize: '0.8rem',
        }}
      >
        {foundedYear != null && cell('Founded', String(foundedYear))}
        {cell('Headquarter', headquartersAndOffices)}
        {hiringLocationsStr && cell('Hiring locations', hiringLocationsStr)}
        {cell('Sponsorship (H1B)', sponsorshipDisplay)}
      </div>
      {/* Row 2: Remote policy (full width) */}
      {fullRow('Remote policy', remotePolicy)}
      {/* Row 3: Hiring process (full width) */}
      {fullRow('Hiring process', hiringProcessDescription)}
      {/* Other short fields in one row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '0.75rem 1rem',
          fontSize: '0.8rem',
        }}
      >
        {cell('Industries', industries?.length ? industries.join(', ') : null)}
        {cell('Size', sizeRange)}
        {cell('Funding', fundingStage)}
        {publicCompany === true && cell('Public', ticker ? `${ticker} (public)` : 'Yes')}
        {techStackHints?.length
          ? cell(
              'Tech stack',
              techStackHints.slice(0, 6).join(', ') + (techStackHints.length > 6 ? '…' : ''),
            )
          : null}
        {jobCountOpen != null && jobCountOpen > 0
          ? cell('Open roles', String(jobCountOpen))
          : jobCountTotal != null && jobCountTotal > 0
            ? cell('Roles', String(jobCountTotal))
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

function HoverDownloadMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="btn"
        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', whiteSpace: 'nowrap' }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 50,
            minWidth: 170,
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 10px 28px rgba(0,0,0,0.25)',
          }}
        >
          {items.map((it) => (
            <a
              key={it.href}
              href={it.href}
              style={{
                display: 'block',
                padding: '0.6rem 0.75rem',
                fontSize: '0.8125rem',
                color: 'var(--text)',
                textDecoration: 'none',
              }}
            >
              {it.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

function ApplicationAssistantClient({ initialAnalysisId }: ApplicationAssistantPageProps = {}) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const { addToast } = useToast();
  const [url, setUrl] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  // Cover letter regenerating
  const [coverRegenerateLoading, setCoverRegenerateLoading] = useState(false);
  const [coverRegenerateInstruction, setCoverRegenerateInstruction] = useState('');
  const [coverLetterExpanded, setCoverLetterExpanded] = useState(false);

  // Application Q&A feature
  const [qaQuery, setQaQuery] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaResult, setQaResult] = useState<string | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);

  const [interviewOpen, setInterviewOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [companySnapshotOpen, setCompanySnapshotOpen] = useState(false);
  const [jobSummaryOpen, setJobSummaryOpen] = useState(false);
  const [profileMatchOpen, setProfileMatchOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [outreachDraftsOpen, setOutreachDraftsOpen] = useState(false);
  const [autoConfirmCompanyTitle, setAutoConfirmCompanyTitle] = useState(false);
  const [companyManuallyConfirmed, setCompanyManuallyConfirmed] = useState(false);
  const [historySortBy, setHistorySortBy] = useState<'date' | 'score' | 'company'>('date');
  const [historySortDir, setHistorySortDir] = useState<'asc' | 'desc'>('desc');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 5;
  const [feedbackList, setFeedbackList] = useState<{ component: string; value: string }[]>([]);
  const [runningOutreach, setRunningOutreach] = useState(false);
  const [outreachLogs, setOutreachLogs] = useState<LogEntry[]>([]);
  const [outreachDraftModalOpen, setOutreachDraftModalOpen] = useState(false);
  const [outreachDraftModalContactIndex, setOutreachDraftModalContactIndex] = useState<
    number | null
  >(null);
  const [outreachDraftModalLoading, setOutreachDraftModalLoading] = useState(false);
  const [outreachDraftModalInstruction, setOutreachDraftModalInstruction] = useState('');
  const [outreachDraftModalDraft, setOutreachDraftModalDraft] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [outreachDraftModalError, setOutreachDraftModalError] = useState<string | null>(null);

  const [automateModalOpen, setAutomateModalOpen] = useState(false);
  const [queueStatus, setQueueStatus] = useState<{
    running: boolean;
    current: number;
    total: number;
    pending: number;
    completed: number;
    failed: number;
  } | null>(null);
  const [queueUploading, setQueueUploading] = useState(false);
  const [queueStopRequested, setQueueStopRequested] = useState(false);

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

  // Poll queue status (for "Automated analysis running: X of Y" and Hard stop)
  useEffect(() => {
    const poll = () => {
      fetch('/api/application-assistant/queue/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setQueueStatus(d))
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2000);
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
    const analysisId = status.analysisId;
    const load = () => {
      fetch(`/api/application-assistant/analyses/${analysisId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setAnalysis(d))
        .catch(() => {});
    };
    load();
    if (status.running) {
      const interval = setInterval(load, 3000);
      return () => clearInterval(interval);
    }
    // When pipeline just finished (done), refetch once after a short delay so we get
    // the final analysis with contacts/drafts (avoids race where last poll was before DB write)
    if (status.currentStep === 'done') {
      const t = setTimeout(load, 800);
      return () => clearTimeout(t);
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

  const effectiveInitialAnalysisId =
    initialAnalysisId ?? (typeof params?.id === 'string' ? params.id : undefined);

  // If we land on /application-assistant/[id], hydrate that analysis once (no live run)
  useEffect(() => {
    if (!effectiveInitialAnalysisId) return;
    if (analysis && analysis.id === effectiveInitialAnalysisId) return;
    if (status?.running) return;
    fetch(`/api/application-assistant/analyses/${effectiveInitialAnalysisId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAnalysis(d as Analysis);
        setUrl(d.url);
        setShowHistory(false);
      })
      .catch(() => {});
  }, [effectiveInitialAnalysisId, status?.running, analysis?.id]);

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

  const handleAskQuestion = useCallback(async () => {
    if (!analysis?.id || !qaQuery.trim()) return;
    setQaLoading(true);
    setQaError(null);
    setQaResult(null);
    try {
      const res = await fetch('/api/application-assistant/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: analysis.id,
          question: qaQuery,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQaError(data.error ?? 'Failed to get an answer.');
        return;
      }
      setQaResult(data.answer);
    } catch (err) {
      setQaError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setQaLoading(false);
    }
  }, [analysis, qaQuery]);
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

  const handleRegenerateCoverLetter = useCallback(async () => {
    if (!analysis?.id || coverRegenerateLoading) return;
    setCoverRegenerateLoading(true);
    try {
      const res = await fetch('/api/application-assistant/regenerate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: analysis.id,
          userInstruction: coverRegenerateInstruction.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error ?? 'Failed to regenerate cover letter', 'error');
        return;
      }
      setCoverRegenerateInstruction('');
      addToast('Cover letter regenerated', 'success');
      const updated = await fetch(`/api/application-assistant/analyses/${analysis.id}`).then((r) =>
        r.ok ? r.json() : null,
      );
      if (updated) setAnalysis(updated as Analysis);
    } catch {
      addToast('Failed to regenerate cover letter', 'error');
    } finally {
      setCoverRegenerateLoading(false);
    }
  }, [analysis, coverRegenerateInstruction, addToast]);

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
      const draft =
        analysis.coverLetters.draft ??
        analysis.coverLetters.formal ??
        Object.values(analysis.coverLetters)[0];
      if (draft) {
        lines.push('=== COVER LETTER ===');
        lines.push(draft);
      }
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

  const companyName =
    (analysis?.companySnapshot?.name as string | undefined) ?? analysis?.jobSummary?.company ?? '';
  const rawCompanyUrl = analysis?.companySnapshot?.url as string | undefined | null;
  const headerCompanyUrl =
    rawCompanyUrl && rawCompanyUrl.trim().length > 0
      ? rawCompanyUrl.startsWith('http')
        ? rawCompanyUrl
        : `https://${rawCompanyUrl}`
      : null;
  const rawCareersUrl = (analysis?.companySnapshot as any)?.careersUrl as string | undefined | null;
  const headerCareersUrl =
    rawCareersUrl && rawCareersUrl.trim().length > 0
      ? rawCareersUrl.startsWith('http')
        ? rawCareersUrl
        : `https://${rawCareersUrl}`
      : null;
  const rawLinkedinUrl = (analysis?.companySnapshot as any)?.linkedinUrl as
    | string
    | undefined
    | null;
  const headerLinkedinUrl =
    rawLinkedinUrl && rawLinkedinUrl.trim().length > 0
      ? rawLinkedinUrl.startsWith('http')
        ? rawLinkedinUrl
        : `https://${rawLinkedinUrl}`
      : null;

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
            {!params?.id && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}
                disabled={isRunning || (queueStatus?.running ?? false)}
                title={
                  queueStatus?.running
                    ? 'Automated analysis in progress'
                    : 'Upload a CSV of job URLs to run analyses in the background'
                }
                onClick={() => setAutomateModalOpen(true)}
              >
                Automate analysis
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

        {queueStatus?.running && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.875rem' }}>
              Automated analysis running: {queueStatus.current} of {queueStatus.total}
              {queueStatus.pending > 0 && ` (${queueStatus.pending} pending)`}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}
              disabled={queueStopRequested}
              onClick={async () => {
                setQueueStopRequested(true);
                try {
                  await fetch('/api/application-assistant/queue/stop', { method: 'POST' });
                  addToast?.(
                    'Stop requested. The current job will finish, then the queue will stop.',
                  );
                } catch {
                  addToast?.('Failed to request stop.');
                } finally {
                  setQueueStopRequested(false);
                }
              }}
            >
              {queueStopRequested ? 'Stopping…' : 'Hard stop'}
            </button>
          </div>
        )}
      </div>

      {/* Automate analysis modal */}
      {automateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="automate-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setAutomateModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 420,
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="automate-modal-title" className="section-title" style={{ marginTop: 0 }}>
              Automate analysis
            </h2>
            <p
              style={{
                color: 'var(--muted-foreground)',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            >
              Upload a CSV with one job URL per row (optional header row). Analyses run in order in
              the background. Results appear in History. An admin must start the queue for your
              account from the Admin page.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
                const file = fileInput?.files?.[0];
                if (!file) {
                  addToast?.('Please select a CSV file.');
                  return;
                }
                setQueueUploading(true);
                try {
                  const formData = new FormData();
                  formData.set('file', file);
                  const res = await fetch('/api/application-assistant/queue/upload', {
                    method: 'POST',
                    body: formData,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    addToast?.(data?.error ?? 'Upload failed.');
                    return;
                  }
                  addToast?.(`Added ${data.added ?? 0} URL(s) to your queue.`);
                  setAutomateModalOpen(false);
                  fileInput.value = '';
                  const statusRes = await fetch('/api/application-assistant/queue/status');
                  if (statusRes.ok) {
                    const next = await statusRes.json();
                    setQueueStatus(next);
                  }
                } finally {
                  setQueueUploading(false);
                }
              }}
            >
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                style={{ marginBottom: '1rem', display: 'block' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAutomateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={queueUploading}>
                  {queueUploading ? 'Uploading…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {new Date(h.createdAt).toLocaleString()} —{' '}
                        {(h as Analysis).runStatus === 'running'
                          ? 'Running…'
                          : h.matchScore != null
                            ? `${h.matchScore}/100`
                            : 'No match'}
                      </span>
                      {(h as Analysis).runSource === 'batch' && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: 4,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          From batch
                        </span>
                      )}
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
                height: 280,
                resize: 'vertical',
                overflow: 'auto',
                background: '#0d1117',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                fontSize: '0.75rem',
                lineHeight: 1.5,
                padding: '0.5rem 1rem 0.75rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              {logs.length === 0 && outreachLogs.length === 0 ? (
                <div style={{ color: 'var(--muted-foreground)' }}>
                  {starting
                    ? 'Starting pipeline…'
                    : runningOutreach
                      ? 'Running outreach…'
                      : 'Waiting for logs…'}
                </div>
              ) : (
                [...logs, ...outreachLogs].map((l, idx) => {
                  const isLast = idx === logs.length + outreachLogs.length - 1;
                  return (
                    <div
                      key={l.id}
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginBottom: '0.15rem',
                        animation:
                          (isRunning || runningOutreach) && isLast
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

      {/* Application Q&A (Ask the AI) */}
      {analysis && (analysis.runStatus === 'done' || status?.currentStep === 'done') && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ margin: '0 0 0.75rem 0' }}>
            Job Q&A
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              marginTop: 0,
              marginBottom: '1rem',
            }}
          >
            Ask me anything about this job posting, the company, or your profile match!
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: '200px' }}
              placeholder="e.g. What are the key skills I need to highlight?"
              value={qaQuery}
              onChange={(e) => setQaQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAskQuestion();
                }
              }}
              disabled={qaLoading}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={qaLoading || !qaQuery.trim()}
              onClick={handleAskQuestion}
            >
              {qaLoading ? 'Thinking…' : 'Ask'}
            </button>
          </div>
          {qaError && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--danger)' }}>
              {qaError}
            </div>
          )}
          {qaResult && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {qaResult}
            </div>
          )}
        </div>
      )}

      {/* Application Checklist — right below Agent Terminal; full row clickable so chevron always works */}
      {analysis?.applicationChecklist && analysis.applicationChecklist.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: 0 }}>
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
              padding: '0.75rem 1rem',
              textAlign: 'left',
            }}
            aria-label={checklistOpen ? 'Collapse checklist' : 'Expand checklist'}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Application Checklist
            </h2>
            <span
              style={{
                display: 'inline-block',
                flexShrink: 0,
                minWidth: 20,
                transform: checklistOpen ? 'rotate(90deg)' : 'rotate(180deg)',
                transition: 'transform 0.15s ease-out',
                fontSize: '0.75rem',
                color: 'var(--muted-foreground)',
              }}
            >
              ▶
            </span>
          </button>
          {checklistOpen && (
            <div
              style={{
                padding: '0 1rem 1rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              {analysis.applicationChecklist.map((item, i) => {
                const done = item.done === true;
                const userActionNeeded = item.userActionNeeded === true && !done;
                const icon = done ? '\u2713' : userActionNeeded ? '\u26A0' : '\u25CB';
                const iconColor = done
                  ? 'var(--success)'
                  : userActionNeeded
                    ? 'var(--warning, #eab308)'
                    : 'var(--muted-foreground)';
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <span
                      style={{
                        color: iconColor,
                        fontSize: userActionNeeded ? '0.9em' : undefined,
                      }}
                      title={
                        userActionNeeded ? 'Your turn — tailor your resume to this role' : undefined
                      }
                    >
                      {icon}
                    </span>
                    <span style={{ color: done ? 'var(--text-secondary)' : 'var(--text)' }}>
                      {item.item}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Company Snapshot — droppable, default collapsed; collapsed shows name, website, about only */}
      {analysis?.jobSummary && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              {companyName && headerCompanyUrl && (
                <a
                  href={headerCompanyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="section-title"
                  style={{ margin: 0, fontSize: '0.9rem', textDecoration: 'underline' }}
                >
                  {companyName}
                </a>
              )}
              {companyName && !headerCompanyUrl && (
                <h2 className="section-title" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {companyName}
                </h2>
              )}
              {headerCareersUrl && (
                <>
                  <span style={{ color: 'var(--muted-foreground)' }}>|</span>
                  <a
                    href={headerCareersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.85rem' }}
                  >
                    Careers
                  </a>
                </>
              )}
              {headerLinkedinUrl && (
                <>
                  <span style={{ color: 'var(--muted-foreground)' }}>|</span>
                  <a
                    href={headerLinkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.85rem' }}
                  >
                    LinkedIn
                  </a>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCompanySnapshotOpen((open) => !open)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0.15rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={
                companySnapshotOpen ? 'Collapse company snapshot' : 'Expand company snapshot'
              }
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: companySnapshotOpen ? 'rotate(90deg)' : 'rotate(180deg)',
                  transition: 'transform 0.15s ease-out',
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                ▶
              </span>
            </button>
          </div>
          {!companySnapshotOpen && (
            <div style={{ padding: '0 1rem 0.75rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.85rem', marginTop: 4, color: 'var(--text-secondary)' }}>
                {analysis.companySnapshot?.descriptionText
                  ? String(analysis.companySnapshot.descriptionText)
                  : analysis.companyResearch
                    ? analysis.companyResearch
                    : String(analysis.jobSummary.companyOneLiner ?? '—')}
              </div>
            </div>
          )}
          {companySnapshotOpen && (
            <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border)' }}>
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
                      marginTop: '0.75rem',
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
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
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
                          analysis.companyResearch ??
                          analysis.jobSummary.companyOneLiner ??
                          undefined
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
                  marginTop: '0.75rem',
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
        </div>
      )}

      {/* Company/title confirmation gate (Phase 10) */}
      {analysis?.jobSummary &&
        !autoSkipConfirmGate &&
        !companyManuallyConfirmed &&
        currentStepIdx < stepIndex('matching') && (
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
                Resolver confidence: {companyConfidence}% · Cleaning confidence:{' '}
                {cleaningConfidence}%{' '}
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

      {/* Job summary — collapsed by default; compact header with title link (accent) + company */}
      {analysis?.jobSummary && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="section-title" style={{ margin: 0, marginBottom: '0.25rem' }}>
                Job Summary
              </h2>
              {!jobSummaryOpen && (
                <div style={{ marginTop: 4 }}>
                  <a
                    href={analysis.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontWeight: 600,
                      color: 'var(--accent)',
                      fontSize: '0.95rem',
                      textDecoration: 'underline',
                    }}
                  >
                    {(analysis.jobSummary as JobSummary).title}
                  </a>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--muted-foreground)',
                      marginTop: 2,
                    }}
                  >
                    {(analysis.jobSummary as JobSummary).company}
                    {(analysis.jobSummary as JobSummary).companyOneLiner && (
                      <span style={{ fontStyle: 'italic' }}>
                        {' '}
                        — {(analysis.jobSummary as JobSummary).companyOneLiner}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setJobSummaryOpen((o) => !o)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0.15rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={jobSummaryOpen ? 'Collapse job summary' : 'Expand job summary'}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: jobSummaryOpen ? 'rotate(90deg)' : 'rotate(180deg)',
                  transition: 'transform 0.15s ease-out',
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                ▶
              </span>
            </button>
          </div>
          {jobSummaryOpen && (
            <div style={{ padding: '1rem 1rem 1rem', borderTop: '1px solid var(--border)' }}>
              <JobSummaryCard
                job={analysis.jobSummary as JobSummary}
                showHeading={false}
                jobUrl={analysis.url}
              />
            </div>
          )}
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
            expanded={profileMatchOpen}
            onToggle={() => setProfileMatchOpen((o) => !o)}
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

      {/* Cover letter (single draft; regenerate via instruction) */}
      {analysis?.coverLetters &&
        (() => {
          const draftText =
            analysis.coverLetters.draft ??
            analysis.coverLetters.formal ??
            Object.values(analysis.coverLetters)[0];
          if (!draftText) return null;
          return (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: coverLetterExpanded ? '0.75rem' : '0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2 className="section-title" style={{ margin: 0 }}>
                    Cover Letter
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <HoverDownloadMenu
                      label="⬇"
                      items={[
                        {
                          label: 'Download DOCX',
                          href: `/api/application-assistant/cover-letter-download?analysisId=${analysis.id}&format=docx`,
                        },
                        {
                          label: 'Download PDF',
                          href: `/api/application-assistant/cover-letter-download?analysisId=${analysis.id}&format=pdf`,
                        },
                      ]}
                    />
                  </div>
                  <EvidenceInfoIcon
                    evidence={analysis.coverLettersEvidence ?? undefined}
                    cardTitle="Cover Letter"
                  />
                  <button
                    type="button"
                    onClick={() => setCoverLetterExpanded((prev) => !prev)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label={
                      coverLetterExpanded ? 'Collapse cover letter' : 'Expand cover letter'
                    }
                  >
                    <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                      {coverLetterExpanded ? '▼' : '◀'}
                    </span>
                  </button>
                </div>
              </div>
              {coverLetterExpanded && (
                <>
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
                    {draftText}
                  </div>
                  <div
                    style={{
                      marginTop: '0.75rem',
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(draftText, 'draft');
                      }}
                    >
                      {copyFeedback === 'draft' ? 'Copied!' : 'Copy to clipboard'}
                    </button>
                    <div onClick={(e) => e.stopPropagation()}>
                      <FeedbackThumbs
                        analysisId={analysis.id}
                        component="outreach"
                        feedbackValue={
                          (feedbackList?.find((f) => f.component === 'outreach')?.value as
                            | 'up'
                            | 'down') ?? null
                        }
                        onFeedbackSubmitted={setFeedbackList}
                      />
                    </div>
                  </div>
                </>
              )}
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <label className="label" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  Change the cover letter
                </label>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--muted-foreground)',
                    marginBottom: '0.5rem',
                  }}
                >
                  Describe how you’d like it revised (e.g. “shorter and more direct”, “add a
                  paragraph about X”). Then click Send to regenerate only the cover letter.
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                  }}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Make it more concise and add a line about relocation"
                    value={coverRegenerateInstruction}
                    onChange={(e) => setCoverRegenerateInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleRegenerateCoverLetter();
                      }
                    }}
                    style={{ flex: '1 1 16rem', minWidth: 0 }}
                    disabled={coverRegenerateLoading}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={coverRegenerateLoading}
                    onClick={handleRegenerateCoverLetter}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {coverRegenerateLoading ? 'Regenerating…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Extras: Salary check, Interview prep, Contacts (or Run Deep Outreach), Checklist */}
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

      {/* Contacts: show only after outreach has completed AND we have ranked contacts — collapsed by default */}
      {analysis &&
        (analysis.runStatus === 'done' || status?.currentStep === 'done') &&
        (() => {
          const c = analysis.contacts as Record<string, unknown> | null | undefined;
          const ranked = (Array.isArray(c?.ranked) ? c?.ranked : []) as unknown[];
          const best = c && 'bestFirst' in c ? (c.bestFirst as unknown) : null;
          return best != null || ranked.length > 0;
        })() &&
        (() => {
          const c = analysis!.contacts as Record<string, unknown> | null | undefined;
          const hasNewShape =
            c && (c.bestFirst != null || (Array.isArray(c.ranked) && c.ranked.length > 0));
          const hasLegacyShape =
            c &&
            ((Array.isArray(c.emails) && c.emails.length > 0) ||
              (Array.isArray(c.linkedIn) && c.linkedIn.length > 0) ||
              (Array.isArray(c.others) && c.others.length > 0));
          const hasDraftsOnly =
            Array.isArray(c?.drafts) &&
            (c.drafts as unknown[]).length > 0 &&
            !hasNewShape &&
            !hasLegacyShape;
          const hasContacts = hasNewShape || hasLegacyShape || hasDraftsOnly;
          const bestContact = c?.bestFirst as Record<string, string | undefined> | null | undefined;
          const rankedList = (c?.ranked as Record<string, string | undefined>[] | undefined) ?? [];
          const draftsCount = Array.isArray(c?.drafts) ? (c.drafts as unknown[]).length : 0;
          const evidenceSummary = (analysis!.contactsEvidence as { summary?: string })?.summary;
          if (!hasContacts || !c) return null;
          if (hasDraftsOnly && rankedList.length === 0 && !bestContact) {
            return (
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h2 className="section-title" style={{ margin: 0 }}>
                  Contacts
                </h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {evidenceSummary ??
                    (draftsCount > 0
                      ? `${draftsCount} outreach draft(s) saved.`
                      : 'Outreach completed.')}
                </p>
                <div style={{ marginTop: '0.75rem' }}>
                  <FeedbackThumbs
                    analysisId={analysis!.id}
                    component="outreach"
                    feedbackValue={
                      (feedbackList?.find((f) => f.component === 'outreach')?.value as
                        | 'up'
                        | 'down') ?? null
                    }
                    onFeedbackSubmitted={setFeedbackList}
                  />
                </div>
              </div>
            );
          }
          return (
            <div className="card" style={{ marginBottom: '1.5rem', padding: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                }}
              >
                <h2 className="section-title" style={{ margin: 0 }}>
                  Contacts
                  {rankedList.length > 0 && (
                    <span style={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>
                      {' '}
                      · Ranked top {rankedList.length}
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <EvidenceInfoIcon
                    evidence={analysis!.contactsEvidence ?? undefined}
                    cardTitle="Contacts"
                  />
                  <button
                    type="button"
                    onClick={() => setContactsOpen((o) => !o)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-label={contactsOpen ? 'Collapse contacts' : 'Expand contacts'}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        transform: contactsOpen ? 'rotate(90deg)' : 'rotate(180deg)',
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
              {!contactsOpen && bestContact && (
                <div
                  style={{
                    padding: '0.75rem 1rem 0.75rem',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      padding: '1rem',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted-foreground)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Best contact
                    </div>
                    {bestContact.linkedinUrl ? (
                      <a
                        href={bestContact.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 600, color: 'var(--accent)' }}
                      >
                        {bestContact.name ?? '—'}
                        {bestContact.contactRole || bestContact.role
                          ? ` [${bestContact.contactRole || bestContact.role}]`
                          : ''}
                      </a>
                    ) : (
                      <span style={{ fontWeight: 600 }}>
                        {bestContact.name ?? '—'}
                        {bestContact.contactRole || bestContact.role
                          ? ` [${bestContact.contactRole || bestContact.role}]`
                          : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {contactsOpen && (
                <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border)' }}>
                  {bestContact && (
                    <div
                      style={{
                        padding: '1rem',
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        marginBottom: '0.75rem',
                        marginTop: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--muted-foreground)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Best contact
                      </div>
                      {bestContact.linkedinUrl ? (
                        <a
                          href={bestContact.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 600, color: 'var(--accent)' }}
                        >
                          {bestContact.name ?? '—'}
                          {bestContact.contactRole || bestContact.role
                            ? ` [${bestContact.contactRole || bestContact.role}]`
                            : ''}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>
                          {bestContact.name ?? '—'}
                          {bestContact.contactRole || bestContact.role
                            ? ` [${bestContact.contactRole || bestContact.role}]`
                            : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {rankedList.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--muted-foreground)',
                          marginBottom: '0.35rem',
                        }}
                      >
                        All ranked contacts — click name for LinkedIn; use ✨ to create an outreach
                        draft
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                        {rankedList.map((r: Record<string, string | undefined>, i: number) => (
                          <li
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.5rem',
                              marginBottom: '0.4rem',
                              padding: '0.35rem 0',
                              borderBottom:
                                i < rankedList.length - 1 ? '1px solid var(--border)' : undefined,
                            }}
                          >
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: 'var(--muted-foreground)',
                                  fontSize: '0.8rem',
                                  flexShrink: 0,
                                  width: 20,
                                }}
                              >
                                {i + 1}
                              </span>
                              {r.linkedinUrl ? (
                                <a
                                  href={r.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontWeight: 600,
                                    color: 'var(--accent)',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {r.name ?? '—'}
                                  {r.contactRole || r.role ? ` [${r.contactRole || r.role}]` : ''}
                                </a>
                              ) : (
                                <span style={{ fontWeight: 600 }}>
                                  {r.name ?? '—'}
                                  {r.contactRole || r.role ? ` [${r.contactRole || r.role}]` : ''}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              title="Create outreach draft for this contact"
                              onClick={async () => {
                                if (!analysis?.id) return;
                                setOutreachDraftModalContactIndex(i);
                                setOutreachDraftModalOpen(true);
                                setOutreachDraftModalLoading(true);
                                setOutreachDraftModalInstruction('');
                                setOutreachDraftModalDraft(null);
                                setOutreachDraftModalError(null);
                                try {
                                  const res = await fetch(
                                    '/api/application-assistant/outreach-draft',
                                    {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        analysisId: analysis.id,
                                        contactIndex: i,
                                      }),
                                    },
                                  );
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) {
                                    setOutreachDraftModalError(
                                      (data as { error?: string }).error ??
                                        'Failed to create draft',
                                    );
                                    return;
                                  }
                                  setOutreachDraftModalDraft(
                                    (data as { draft?: Record<string, unknown> }).draft ?? null,
                                  );
                                  const updated = await fetch(
                                    `/api/application-assistant/analyses/${analysis.id}`,
                                  )
                                    .then((r) => (r.ok ? r.json() : null))
                                    .catch(() => null);
                                  if (updated) setAnalysis(updated as Analysis);
                                } finally {
                                  setOutreachDraftModalLoading(false);
                                }
                              }}
                              style={{
                                flexShrink: 0,
                                border: 'none',
                                background: 'var(--surface-elevated)',
                                borderRadius: 6,
                                padding: '0.35rem 0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: 'var(--accent)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                              }}
                            >
                              ✨ Draft
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div style={{ marginTop: '0.75rem' }}>
                    <FeedbackThumbs
                      analysisId={analysis.id}
                      component="contact"
                      feedbackValue={
                        (feedbackList?.find((f) => f.component === 'contact')?.value as
                          | 'up'
                          | 'down') ?? null
                      }
                      onFeedbackSubmitted={setFeedbackList}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* Outreach draft modal — on-demand draft for one contact */}
      {outreachDraftModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="outreach-draft-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            padding: '1rem',
          }}
          onClick={() => {
            if (!outreachDraftModalLoading) {
              setOutreachDraftModalOpen(false);
              setOutreachDraftModalContactIndex(null);
              setOutreachDraftModalInstruction('');
              setOutreachDraftModalDraft(null);
              setOutreachDraftModalError(null);
            }
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 520,
              width: '100%',
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="outreach-draft-modal-title"
              className="section-title"
              style={{ margin: '0 0 0.75rem 0' }}
            >
              Outreach draft
            </h2>
            {outreachDraftModalLoading && (
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>Creating draft…</p>
            )}
            {outreachDraftModalError && (
              <>
                <p style={{ margin: 0, color: 'var(--error)' }}>{outreachDraftModalError}</p>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => {
                    setOutreachDraftModalOpen(false);
                    setOutreachDraftModalContactIndex(null);
                    setOutreachDraftModalError(null);
                  }}
                >
                  Close
                </button>
              </>
            )}
            {!outreachDraftModalLoading && !outreachDraftModalError && outreachDraftModalDraft && (
              <>
                <div
                  style={{
                    marginBottom: '0.75rem',
                    fontSize: '0.8125rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {(() => {
                    const platform = String(outreachDraftModalDraft.platform ?? '');
                    const contactName = String(outreachDraftModalDraft.contactName ?? '');
                    const platformLabel =
                      platform === 'LINKEDIN_CONNECTION'
                        ? 'LinkedIn connection'
                        : platform === 'EMAIL'
                          ? 'Email'
                          : platform || 'Draft';
                    return `${platformLabel}${contactName ? ` - ${contactName}` : ''} · ${String(outreachDraftModalDraft.tone ?? '')}`;
                  })()}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                    Change request (optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Make it warmer, mention my AWS experience, ask for a quick 10 min chat"
                    value={outreachDraftModalInstruction}
                    onChange={(e) => setOutreachDraftModalInstruction(e.target.value)}
                  />
                </div>
                {outreachDraftModalDraft.subject != null && (
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
                    <strong>Subject:</strong> {String(outreachDraftModalDraft.subject)}
                  </div>
                )}
                <div
                  style={{
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                >
                  {String(outreachDraftModalDraft.body ?? '').replace(/\n{3,}/g, '\n\n')}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      copyToClipboard(
                        String(outreachDraftModalDraft.body ?? '').replace(/\n{3,}/g, '\n\n'),
                        'outreach-draft-modal',
                      );
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={outreachDraftModalLoading}
                    onClick={async () => {
                      if (!analysis?.id || outreachDraftModalContactIndex == null) return;
                      setOutreachDraftModalLoading(true);
                      setOutreachDraftModalError(null);
                      try {
                        const res = await fetch('/api/application-assistant/outreach-draft', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            analysisId: analysis.id,
                            contactIndex: outreachDraftModalContactIndex,
                            userInstruction: outreachDraftModalInstruction.trim() || undefined,
                          }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setOutreachDraftModalError(
                            (data as { error?: string }).error ?? 'Failed to regenerate draft',
                          );
                          return;
                        }
                        setOutreachDraftModalDraft(
                          (data as { draft?: Record<string, unknown> }).draft ?? null,
                        );
                        const updated = await fetch(
                          `/api/application-assistant/analyses/${analysis.id}`,
                        )
                          .then((r) => (r.ok ? r.json() : null))
                          .catch(() => null);
                        if (updated) setAnalysis(updated as Analysis);
                      } finally {
                        setOutreachDraftModalLoading(false);
                      }
                    }}
                  >
                    Change draft
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setOutreachDraftModalOpen(false);
                      setOutreachDraftModalContactIndex(null);
                      setOutreachDraftModalInstruction('');
                      setOutreachDraftModalDraft(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Outreach drafts (from Deep Outreach Research pipeline) — collapsed by default */}
      {analysis &&
        (analysis.runStatus === 'done' || status?.currentStep === 'done') &&
        Array.isArray((analysis.contacts as Record<string, unknown>)?.drafts) &&
        ((analysis.contacts as Record<string, unknown>).drafts as unknown[]).length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem', padding: 0 }}>
            <button
              type="button"
              onClick={() => setOutreachDraftsOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              aria-label={
                outreachDraftsOpen ? 'Collapse outreach drafts' : 'Expand outreach drafts'
              }
            >
              <h2 className="section-title" style={{ margin: 0 }}>
                Outreach drafts
              </h2>
              <span
                style={{
                  display: 'inline-block',
                  transform: outreachDraftsOpen ? 'rotate(90deg)' : 'rotate(180deg)',
                  transition: 'transform 0.15s ease-out',
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                ▶
              </span>
            </button>
            {outreachDraftsOpen && (
              <div
                style={{
                  padding: '0 1rem 1rem',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <p
                  style={{
                    margin: '0.75rem 0 0.75rem 0',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Copy a draft below for LinkedIn connection, LinkedIn DM, or email.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(
                    (analysis.contacts as Record<string, unknown>).drafts as Record<
                      string,
                      unknown
                    >[]
                  ).map((d: Record<string, unknown>, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '1rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                          {(() => {
                            const platform = String(d.platform ?? '');
                            const contactName = String(d.contactName ?? '');
                            const platformLabel =
                              platform === 'LINKEDIN_CONNECTION'
                                ? 'LinkedIn connection'
                                : platform === 'EMAIL'
                                  ? 'Email'
                                  : platform || 'Draft';
                            const tone = d.tone != null ? String(d.tone) : '';
                            const variant = d.variant != null ? String(d.variant) : '';
                            return `${platformLabel}${contactName ? ` - ${contactName}` : ''}${
                              variant ? ` · ${variant}` : ''
                            }${tone ? ` (${tone})` : ''}`;
                          })()}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              String(d.body ?? '').replace(/\n{3,}/g, '\n\n'),
                              `outreach-${i}`,
                            )
                          }
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            background: 'var(--surface-elevated)',
                          }}
                        >
                          Copy
                        </button>
                        <HoverDownloadMenu
                          label="Download"
                          items={[
                            {
                              label: 'Download DOCX',
                              href: `/api/application-assistant/outreach-draft-download?analysisId=${analysis.id}&draftIndex=${i}&format=docx`,
                            },
                            {
                              label: 'Download PDF',
                              href: `/api/application-assistant/outreach-draft-download?analysisId=${analysis.id}&draftIndex=${i}&format=pdf`,
                            },
                          ]}
                        />
                        {d.contactIndex != null && (
                          <button
                            type="button"
                            onClick={() => {
                              setOutreachDraftModalContactIndex(Number(d.contactIndex));
                              setOutreachDraftModalInstruction('');
                              setOutreachDraftModalDraft(d);
                              setOutreachDraftModalError(null);
                              setOutreachDraftModalOpen(true);
                              setOutreachDraftModalLoading(false);
                            }}
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              cursor: 'pointer',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              background: 'var(--surface-elevated)',
                            }}
                          >
                            Change
                          </button>
                        )}
                      </div>
                      {d.subject != null &&
                        (() => {
                          const subj: string = String(d.subject ?? '');
                          return (
                            <div style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                              <strong>Subject:</strong> {subj}
                            </div>
                          );
                        })()}
                      <div
                        style={{
                          fontSize: '0.875rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {String(d.body ?? '').replace(/\n{3,}/g, '\n\n')}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <FeedbackThumbs
                    analysisId={analysis.id}
                    component="outreach"
                    feedbackValue={
                      (feedbackList?.find((f) => f.component === 'outreach')?.value as
                        | 'up'
                        | 'down') ?? null
                    }
                    onFeedbackSubmitted={setFeedbackList}
                  />
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

// Next.js page entry (must not accept custom props).
export default function ApplicationAssistantPage() {
  return <ApplicationAssistantClient />;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function JobSummaryCard({
  job,
  showHeading = true,
  jobUrl,
}: {
  job: JobSummary;
  showHeading?: boolean;
  jobUrl?: string;
}) {
  const titleEl =
    jobUrl != null ? (
      <a
        href={jobUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--accent)',
          lineHeight: 1.3,
          textDecoration: 'underline',
        }}
      >
        {job.title}
      </a>
    ) : (
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
        {job.title}
      </div>
    );
  return (
    <div
      style={{
        marginBottom: showHeading ? '1.5rem' : 0,
        ...(showHeading ? {} : { padding: 0, background: 'none', border: 'none', borderRadius: 0 }),
      }}
      className={showHeading ? 'card' : undefined}
    >
      {showHeading && (
        <h2 className="section-title" style={{ margin: '0 0 0.75rem 0' }}>
          Job Summary
        </h2>
      )}
      <div style={{ marginBottom: '0.75rem' }}>
        {titleEl}
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
  expanded = true,
  onToggle,
}: {
  score: number;
  grade: string;
  rationale?: string;
  breakdown: MatchBreakdown & { strengths?: string[]; gaps?: string[] };
  matchEvidence?: Record<string, unknown> | null;
  analysisId?: string;
  feedbackValue?: 'up' | 'down' | null;
  onFeedbackSubmitted?: (list: { component: string; value: string }[]) => void;
  expanded?: boolean;
  onToggle?: () => void;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <EvidenceInfoIcon evidence={matchEvidence} cardTitle="Profile Match" />
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0.15rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={expanded ? 'Collapse breakdown' : 'Expand breakdown'}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: expanded ? 'rotate(90deg)' : 'rotate(180deg)',
                  transition: 'transform 0.15s ease-out',
                  fontSize: '0.75rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                ▶
              </span>
            </button>
          )}
        </div>
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

      {/* Breakdown bars — only when expanded */}
      {expanded && (
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
      )}
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
