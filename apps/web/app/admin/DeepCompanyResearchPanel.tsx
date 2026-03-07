'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type LogEntry = { ts: string; level: string; message: string };

/** Parse CSV text: one column expected (company name). Returns trimmed non-empty names. Skips header row "name". */
function parseCsvCompanyNames(csvText: string): string[] {
  const lines = csvText.split(/\r?\n/);
  const names: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const firstColumn = trimmed.split(',')[0]?.trim() ?? trimmed;
    const name = firstColumn.replace(/^"|"$/g, '').trim();
    if (!name) continue;
    if (names.length === 0 && name.toLowerCase() === 'name') continue; // skip header row
    names.push(name);
  }
  return names;
}

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

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    total: number;
    added: number;
    skipped?: number;
    error?: string;
  } | null>(null);

  const [unresearchedCount, setUnresearchedCount] = useState<number>(0);
  const [continueBatch, setContinueBatch] = useState(false);
  const continueBatchRef = useRef(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  /** Load latest run + logs from DB so state is restored when returning to the page. */
  async function fetchStatus(opts?: { fromPoll?: boolean }) {
    try {
      const res = await fetch('/api/admin/deep-company-research');
      if (!res.ok) return;
      const data = await res.json();
      if (data.run) {
        const run = data.run as {
          id: string;
          status: string;
          companyName: string;
          startedAt: string;
          completedAt: string | null;
        };
        const logEntries = (data.logs ?? []) as { ts: string; level: string; message: string }[];
        if (!opts?.fromPoll || !streamingRef.current) {
          setLogs(logEntries);
        }
        setCompanyName(run.companyName);
        if (run.status === 'running') {
          setRunning(true);
        } else {
          setRunning(false);
        }
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  /** Poll for status and new logs while a run is in progress (e.g. user returned to page). */
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => fetchStatus({ fromPoll: true }), 2500);
    return () => clearInterval(interval);
  }, [running]);

  async function fetchUnresearchedCount() {
    try {
      const res = await fetch('/api/admin/companies/unresearched');
      if (!res.ok) return;
      const data = await res.json();
      setUnresearchedCount(typeof data.count === 'number' ? data.count : 0);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchUnresearchedCount();
  }, []);

  async function handleImportCsv() {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await csvFile.text();
      const companyNames = parseCsvCompanyNames(text);
      if (companyNames.length === 0) {
        setImportResult({ ok: false, total: 0, added: 0, error: 'No company names found in file' });
        return;
      }
      const res = await fetch('/api/admin/companies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNames }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportResult({
          ok: false,
          total: companyNames.length,
          added: 0,
          error: data.error ?? res.statusText ?? 'Import failed',
        });
        return;
      }
      setImportResult({
        ok: true,
        total: data.total ?? companyNames.length,
        added: data.added ?? 0,
        skipped: data.skipped ?? 0,
      });
      setCsvFile(null);
      await fetchUnresearchedCount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportResult({ ok: false, total: 0, added: 0, error: msg });
    } finally {
      setImporting(false);
    }
  }

  async function handleStart(nameOverride?: string, opts?: { partOfBatch?: boolean }) {
    const name = (nameOverride ?? companyName).trim();
    if (!name) return;
    if (nameOverride) setCompanyName(name);
    setRunning(true);
    streamingRef.current = true;
    if (!opts?.partOfBatch) {
      setLogs([]);
      setResult(null);
    } else {
      setLogs((prev) => [
        ...prev,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: `--- Next: ${name} ---`,
        },
      ]);
    }
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
      streamingRef.current = false;
      setRunning(false);
      await fetchUnresearchedCount();
      if (continueBatchRef.current) {
        try {
          const res = await fetch('/api/admin/companies/unresearched');
          if (!res.ok) {
            continueBatchRef.current = false;
            setContinueBatch(false);
            return;
          }
          const data = await res.json();
          const names = Array.isArray(data.companyNames) ? data.companyNames : [];
          const next = names[0];
          if (next) {
            handleStart(next, { partOfBatch: true });
          } else {
            continueBatchRef.current = false;
            setContinueBatch(false);
          }
        } catch {
          continueBatchRef.current = false;
          setContinueBatch(false);
        }
      }
    }
  }

  async function handleContinueDeepResearch() {
    try {
      const res = await fetch('/api/admin/companies/unresearched');
      if (!res.ok) return;
      const data = await res.json();
      const names = Array.isArray(data.companyNames) ? data.companyNames : [];
      const next = names[0];
      if (!next) return;
      continueBatchRef.current = true;
      setContinueBatch(true);
      handleStart(next);
    } catch {
      // ignore
    }
  }

  function handleStopBatch() {
    continueBatchRef.current = false;
    setContinueBatch(false);
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
          <Button onClick={() => handleStart()} disabled={running || !companyName.trim()}>
            {running ? 'Running…' : 'Deep Research Company'}
          </Button>
          {unresearchedCount > 0 && !continueBatch && (
            <Button
              variant="secondary"
              onClick={handleContinueDeepResearch}
              disabled={running}
              title={`Run deep research for all ${unresearchedCount} remaining; stops when none left or you click Stop batch`}
            >
              Continue deep research ({unresearchedCount} remaining)
            </Button>
          )}
          {continueBatch && (
            <Button
              variant="outline"
              onClick={handleStopBatch}
              title="After the current run finishes, no more will start automatically"
            >
              Stop batch {running ? `(after current)` : ''}
            </Button>
          )}
        </div>

        <div className="rounded-md border border-muted bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-medium">Import companies from CSV</p>
          <p className="text-muted-foreground text-xs">
            Upload a CSV with a single column of company names (one per row). Companies are added
            sequentially, one by one. You can then run deep research on each from the field above.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="file"
              accept=".csv"
              className="max-w-[240px]"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              disabled={importing}
            />
            <Button onClick={handleImportCsv} disabled={importing || !csvFile} variant="secondary">
              {importing ? 'Adding…' : 'Add companies'}
            </Button>
          </div>
          {importResult && (
            <p
              className={
                importResult.ok
                  ? 'text-sm text-green-600 dark:text-green-400'
                  : 'text-sm text-red-600 dark:text-red-400'
              }
            >
              {importResult.ok
                ? `Added ${importResult.added} companies (${importResult.total} total processed).${
                    (importResult.skipped ?? 0) > 0
                      ? ` ${importResult.skipped} already researched, skipped.`
                      : ''
                  }`
                : (importResult.error ?? 'Import failed')}
            </p>
          )}
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
