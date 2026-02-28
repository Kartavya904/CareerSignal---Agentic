'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type LogEntry = { ts: string; level: string; message: string };

export function DeepCompanyResearchPanel() {
  const [companyName, setCompanyName] = useState('');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<{
    success: boolean;
    company?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  async function handleStart() {
    const name = companyName.trim();
    if (!name) return;
    setRunning(true);
    setLogs([]);
    setResult(null);
    try {
      const res = await fetch('/api/admin/deep-company-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: name }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setResult({
          success: false,
          error: data.error ?? res.statusText ?? 'Request failed',
        });
        if (data.logs?.length) setLogs(data.logs);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as {
              type: string;
              ts?: string;
              level?: string;
              message?: string;
              success?: boolean;
              company?: Record<string, unknown>;
              error?: string;
              runFolderName?: string;
              fieldConfidence?: unknown;
            };
            if (
              data.type === 'log' &&
              data.ts != null &&
              data.level != null &&
              data.message != null
            ) {
              setLogs((prev) => [
                ...prev,
                { ts: data.ts!, level: data.level!, message: data.message! },
              ]);
            } else if (data.type === 'result') {
              setResult({
                success: data.success === true,
                company: data.company,
                error: data.error,
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer) as {
            type: string;
            ts?: string;
            level?: string;
            message?: string;
            success?: boolean;
            company?: Record<string, unknown>;
            error?: string;
          };
          if (
            data.type === 'log' &&
            data.ts != null &&
            data.level != null &&
            data.message != null
          ) {
            setLogs((prev) => [
              ...prev,
              { ts: data.ts!, level: data.level!, message: data.message! },
            ]);
          } else if (data.type === 'result') {
            setResult({
              success: data.success === true,
              company: data.company,
              error: data.error,
            });
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [
        ...prev,
        { ts: new Date().toISOString(), level: 'error', message: `Request failed: ${msg}` },
      ]);
      setResult({ success: false, error: msg });
    } finally {
      setRunning(false);
    }
  }

  const levelClass: Record<string, string> = {
    info: 'text-foreground',
    warn: 'text-amber-600 dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deep Company Research</CardTitle>
        <p className="text-muted-foreground text-sm">
          Run the full deep company dossier workflow: a <strong>visible browser</strong> opens and
          runs DuckDuckGo searches (no API key), then we fetch discovered URLs, run LLM extraction,
          and save to the companies table. Unlimited local searches.
        </p>
        <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/50">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Browser-based search (no API key)
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            When you click &quot;Deep Research Company&quot;, a visible browser window opens and
            performs DuckDuckGo searches for the company (official site, Wikipedia, Reddit, careers,
            etc.). Result links are scraped and their content fetched. No SerpAPI or other API key
            required.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label htmlFor="admin-company-name" className="text-sm font-medium leading-none">
              Company name
            </label>
            <Input
              id="admin-company-name"
              placeholder="e.g. GE Aerospace"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              disabled={running}
              className="min-w-[220px]"
            />
          </div>
          <Button onClick={handleStart} disabled={running || !companyName.trim()}>
            {running ? 'Running…' : 'Deep Research Company'}
          </Button>
        </div>

        {result && (
          <div
            className={
              result.success
                ? 'rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/40'
                : 'rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40'
            }
          >
            {result.success && result.company ? (
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(result.company, null, 2)}
              </pre>
            ) : (
              <p className="text-sm font-medium">{result.error}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">Logs ({logs.length})</span>
          <div
            className="rounded-md border bg-muted/30 p-3 font-mono text-xs max-h-[480px] overflow-y-auto"
            style={{ minHeight: '200px' }}
          >
            {logs.length === 0 && !running && (
              <p className="text-muted-foreground">
                Click &quot;Deep Research Company&quot; to run. Logs will appear here in real time.
              </p>
            )}
            {logs.length === 0 && running && <p className="text-muted-foreground">Starting…</p>}
            {logs.map((entry, i) => (
              <div key={i} className={levelClass[entry.level] ?? levelClass.info} title={entry.ts}>
                <span className="text-muted-foreground select-none">
                  [{entry.ts.slice(11, 23)}]
                </span>{' '}
                <span className={entry.level === 'error' ? 'font-medium' : ''}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
