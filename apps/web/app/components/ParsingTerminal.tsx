'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from './ToastContext';

interface LogEntry {
  id: number;
  type: 'info' | 'success' | 'error' | 'detail' | 'thinking';
  message: string;
  timestamp: Date;
}

interface StepInfo {
  step: number;
  total: number;
  name: string;
}

interface ProgressEntry {
  id: number;
  event: 'log' | 'step' | 'complete' | 'error';
  data: Record<string, unknown>;
}

interface ParsingTerminalProps {
  /** Whether the terminal is visible */
  isActive: boolean;
  /** true = POST to /start then poll; false = just poll an existing job */
  startJob?: boolean;
  onComplete: () => void;
  onDismiss?: () => void;
  /** Called once the job has been started (so parent can set startJob to false and avoid re-POST on remount) */
  onJobStarted?: () => void;
}

const POLL_INTERVAL_MS = 350;

/** Sleep for ms but resolve immediately when the page becomes visible (so polling resumes when user returns to tab). */
function sleepWithVisibilityWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(t);
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
  });
}

export function ParsingTerminal({
  isActive,
  startJob = true,
  onComplete,
  onDismiss,
  onJobStarted,
}: ParsingTerminalProps) {
  const { addToast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState<StepInfo | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);
  const hasStartedRef = useRef(false);
  const announcedStartRef = useRef(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const addToastRef = useRef(addToast);
  addToastRef.current = addToast;
  const onJobStartedRef = useRef(onJobStarted);
  onJobStartedRef.current = onJobStarted;

  useEffect(() => {
    if (!isActive) return;
    if (startJob && hasStartedRef.current) return;
    if (startJob) hasStartedRef.current = true;
    if (startJob) announcedStartRef.current = false;

    if (startJob) {
      setLogs([]);
      setCurrentStep(null);
      setIsComplete(false);
      setHasError(false);
    }

    let stopped = false;
    let lastId = -1;

    function handleEntry(entry: ProgressEntry) {
      if (entry.event === 'log') {
        const d = entry.data as { type: string; message: string };
        setLogs((prev) => {
          if (!announcedStartRef.current) {
            announcedStartRef.current = true;
            addToastRef.current('Resume parser agent has started.', 'success');
          }
          return [
            ...prev,
            {
              id: ++logIdRef.current,
              type: d.type as LogEntry['type'],
              message: d.message,
              timestamp: new Date(),
            },
          ];
        });
      } else if (entry.event === 'step') {
        setCurrentStep(entry.data as unknown as StepInfo);
      } else if (entry.event === 'complete') {
        const d = entry.data as { summary?: Record<string, unknown> };
        addToastRef.current('Resume parser agent has finished.', 'success');
        setIsComplete(true);
        setLogs((prev) => [
          ...prev,
          {
            id: ++logIdRef.current,
            type: 'success',
            message: '─'.repeat(40),
            timestamp: new Date(),
          },
          {
            id: ++logIdRef.current,
            type: 'success',
            message: '✓ Parsing complete!',
            timestamp: new Date(),
          },
          {
            id: ++logIdRef.current,
            type: 'info',
            message: `  Name: ${(d.summary?.name as string) ?? '—'}`,
            timestamp: new Date(),
          },
          {
            id: ++logIdRef.current,
            type: 'info',
            message: `  Education: ${(d.summary?.educationCount as number) ?? 0} entries`,
            timestamp: new Date(),
          },
          {
            id: ++logIdRef.current,
            type: 'info',
            message: `  Experience: ${(d.summary?.experienceCount as number) ?? 0} entries`,
            timestamp: new Date(),
          },
          {
            id: ++logIdRef.current,
            type: 'info',
            message: `  Projects: ${(d.summary?.projectsCount as number) ?? 0} entries`,
            timestamp: new Date(),
          },
          {
            id: ++logIdRef.current,
            type: 'info',
            message: `  Skills: ${(d.summary?.skillsCount as number) ?? 0} items`,
            timestamp: new Date(),
          },
        ]);
        setTimeout(() => onCompleteRef.current(), 2000);
      } else if (entry.event === 'error') {
        const d = entry.data as { message?: string };
        addToastRef.current(d?.message ?? 'Resume parser failed.', 'error');
        setHasError(true);
        setLogs((prev) => [
          ...prev,
          {
            id: ++logIdRef.current,
            type: 'error',
            message: d?.message ?? 'Unknown error',
            timestamp: new Date(),
          },
        ]);
      }
    }

    const run = async () => {
      if (startJob) {
        try {
          const startRes = await fetch('/api/profile/parse-resume/start', {
            method: 'POST',
            credentials: 'include',
          });
          if (!startRes.ok) {
            addToastRef.current('Failed to start resume parser.', 'error');
            setHasError(true);
            setLogs([
              {
                id: ++logIdRef.current,
                type: 'error',
                message: `HTTP ${startRes.status}`,
                timestamp: new Date(),
              },
            ]);
            return;
          }
          onJobStartedRef.current?.();
        } catch {
          addToastRef.current('Failed to start resume parser.', 'error');
          setHasError(true);
          return;
        }
      }

      let missedPolls = 0;
      while (!stopped) {
        try {
          const res = await fetch(`/api/profile/parse-resume/progress?after=${lastId}`, {
            credentials: 'include',
          });
          if (!res.ok) break;

          const body = (await res.json()) as {
            entries: ProgressEntry[];
            done: boolean;
            exists: boolean;
          };

          if (!body.exists) {
            missedPolls++;
            if (missedPolls > 80) {
              setHasError(true);
              setLogs((prev) => [
                ...prev,
                {
                  id: ++logIdRef.current,
                  type: 'error',
                  message: 'Job timed out. Please try again.',
                  timestamp: new Date(),
                },
              ]);
              break;
            }
          } else {
            missedPolls = 0;
          }

          for (const entry of body.entries) {
            handleEntry(entry);
            if (entry.id > lastId) lastId = entry.id;
          }

          if (body.done) break;
        } catch {
          break;
        }

        await sleepWithVisibilityWake(POLL_INTERVAL_MS);
      }
    };

    run();

    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, startJob]);

  useEffect(() => {
    if (!isActive) hasStartedRef.current = false;
  }, [isActive]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  if (!isActive && logs.length === 0) return null;

  const isRunning = !isComplete && !hasError;

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return '#22c55e';
      case 'error':
        return '#ef4444';
      case 'thinking':
        return '#a855f7';
      case 'detail':
        return '#6b7280';
      default:
        return '#3b82f6';
    }
  };

  const getLogPrefix = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'thinking':
        return '◐';
      case 'detail':
        return '  ';
      default:
        return '›';
    }
  };

  const dotColor = hasError ? '#ef4444' : isComplete ? '#22c55e' : '#eab308';

  return (
    <div
      style={{
        marginTop: '1rem',
        background: '#0d1117',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #30363d',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: '#161b22',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {!isRunning && onDismiss ? (
              <button
                onClick={onDismiss}
                title="Close terminal"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: 'none',
                  background: hasError ? '#ef4444' : '#22c55e',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '8px',
                  color: '#0d1117',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            ) : (
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: dotColor,
                  boxShadow: `0 0 6px ${dotColor}`,
                  animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
                }}
              />
            )}
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#30363d' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#30363d' }} />
          </div>
          <span
            style={{
              color: '#8b949e',
              fontSize: '12px',
              marginLeft: '8px',
              fontFamily: 'monospace',
            }}
          >
            Resume Parser Agent
          </span>
        </div>
        {currentStep && (
          <span style={{ color: '#8b949e', fontSize: '11px', fontFamily: 'monospace' }}>
            Step {currentStep.step}/{currentStep.total}: {currentStep.name}
          </span>
        )}
      </div>

      <div style={{ height: 2, background: '#30363d' }}>
        <div
          style={{
            height: '100%',
            width: currentStep ? `${(currentStep.step / currentStep.total) * 100}%` : '0%',
            background: isComplete
              ? '#22c55e'
              : hasError
                ? '#ef4444'
                : 'linear-gradient(90deg, #3b82f6, #a855f7)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div
        ref={terminalRef}
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '12px',
          fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Consolas, monospace',
          fontSize: '12px',
          lineHeight: '1.5',
          background: '#0d1117',
        }}
      >
        {logs.length === 0 && (
          <div style={{ color: '#8b949e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◐</span>
            <span>Initializing parser...</span>
          </div>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            style={{
              color: getLogColor(log.type),
              display: 'flex',
              gap: '8px',
              animation: 'fadeIn 0.15s ease',
            }}
          >
            <span style={{ opacity: 0.6, minWidth: '14px', flexShrink: 0 }}>
              {getLogPrefix(log.type)}
            </span>
            <span
              style={{
                animation: log.type === 'thinking' ? 'pulse 1.5s ease-in-out infinite' : undefined,
              }}
            >
              {log.message}
            </span>
          </div>
        ))}
        {isRunning && logs.length > 0 && (
          <div style={{ color: '#6b7280', display: 'flex', gap: '8px', marginTop: '2px' }}>
            <span style={{ animation: 'blink 1s step-end infinite' }}>▋</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
