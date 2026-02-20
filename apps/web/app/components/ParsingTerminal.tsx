'use client';

import { useEffect, useRef, useState } from 'react';

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

interface ParsingTerminalProps {
  isActive: boolean;
  onComplete: () => void;
}

export function ParsingTerminal({ isActive, onComplete }: ParsingTerminalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState<StepInfo | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!isActive || hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Reset state
    setLogs([]);
    setCurrentStep(null);
    setIsComplete(false);
    setHasError(false);

    const eventSource = new EventSource('/api/profile/parse-resume/stream');

    eventSource.addEventListener('log', (event) => {
      const data = JSON.parse(event.data);
      setLogs((prev) => [
        ...prev,
        {
          id: ++logIdRef.current,
          type: data.type,
          message: data.message,
          timestamp: new Date(),
        },
      ]);
    });

    eventSource.addEventListener('step', (event) => {
      const data = JSON.parse(event.data);
      setCurrentStep(data);
    });

    eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data);
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
          message: `✓ Parsing complete!`,
          timestamp: new Date(),
        },
        {
          id: ++logIdRef.current,
          type: 'info',
          message: `  Name: ${data.summary.name}`,
          timestamp: new Date(),
        },
        {
          id: ++logIdRef.current,
          type: 'info',
          message: `  Education: ${data.summary.educationCount} entries`,
          timestamp: new Date(),
        },
        {
          id: ++logIdRef.current,
          type: 'info',
          message: `  Experience: ${data.summary.experienceCount} entries`,
          timestamp: new Date(),
        },
        {
          id: ++logIdRef.current,
          type: 'info',
          message: `  Projects: ${data.summary.projectsCount} entries`,
          timestamp: new Date(),
        },
        {
          id: ++logIdRef.current,
          type: 'info',
          message: `  Skills: ${data.summary.skillsCount} items`,
          timestamp: new Date(),
        },
      ]);
      eventSource.close();
      // Call onComplete after a brief delay to let user see the result
      setTimeout(() => onComplete(), 2000);
    });

    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setHasError(true);
        setLogs((prev) => [
          ...prev,
          {
            id: ++logIdRef.current,
            type: 'error',
            message: `Error: ${data.message}`,
            timestamp: new Date(),
          },
        ]);
      } catch {
        setHasError(true);
        setLogs((prev) => [
          ...prev,
          {
            id: ++logIdRef.current,
            type: 'error',
            message: 'Connection error. Please try again.',
            timestamp: new Date(),
          },
        ]);
      }
      eventSource.close();
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [isActive, onComplete]);

  // Reset when isActive becomes false
  useEffect(() => {
    if (!isActive) {
      hasStartedRef.current = false;
    }
  }, [isActive]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isActive && logs.length === 0) return null;

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
      {/* Terminal Header */}
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
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: hasError ? '#ef4444' : isComplete ? '#22c55e' : '#eab308',
                boxShadow: hasError
                  ? '0 0 6px #ef4444'
                  : isComplete
                    ? '0 0 6px #22c55e'
                    : '0 0 6px #eab308',
              }}
            />
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

      {/* Progress Bar */}
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

      {/* Terminal Body */}
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
        {!isComplete && !hasError && logs.length > 0 && (
          <div style={{ color: '#6b7280', display: 'flex', gap: '8px', marginTop: '2px' }}>
            <span style={{ animation: 'blink 1s step-end infinite' }}>▋</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
