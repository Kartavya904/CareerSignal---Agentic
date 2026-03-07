'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Panel for the Contact / Outreach agent (Deep Outreach Research Pipeline).
 * Takes a URL to an existing job in the DB and runs the pipeline.
 */
export function ContactOutreachPanel() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<{ ts: string; level: string; message: string }[]>([]);
  const [result, setResult] = useState<{
    success?: boolean;
    error?: string;
    contacts?: unknown;
    drafts?: unknown;
    runFolderName?: string;
  } | null>(null);

  const [jobUrl, setJobUrl] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobUrl.trim()) return;
    setRunning(true);
    setLogs([]);
    setResult(null);
    try {
      const res = await fetch('/api/admin/contact-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobUrl }),
      });
      await consumeStream(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ success: false, error: `Request failed: ${msg}` });
    } finally {
      setRunning(false);
    }
  }

  async function consumeStream(res: Response) {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setResult({
        success: false,
        error: data.error ?? data.message ?? res.statusText ?? 'Request failed',
      });
      return;
    }
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      setResult({ success: false, error: 'No response body' });
      return;
    }
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t) as {
            type: string;
            ts?: string;
            level?: string;
            message?: string;
            success?: boolean;
            error?: string;
            contacts?: unknown;
            drafts?: unknown;
            runFolderName?: string;
          };
          if (obj.type === 'log' && obj.ts != null && obj.level != null && obj.message != null) {
            setLogs((prev) => [...prev, { ts: obj.ts!, level: obj.level!, message: obj.message! }]);
          } else if (obj.type === 'result') {
            setResult({
              success: obj.success,
              error: obj.error,
              contacts: obj.contacts,
              drafts: obj.drafts,
              runFolderName: obj.runFolderName,
            });
          }
        } catch {
          // skip
        }
      }
    }
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer) as {
          type: string;
          success?: boolean;
          error?: string;
          contacts?: unknown;
          drafts?: unknown;
          runFolderName?: string;
        };
        if (obj.type === 'result') {
          setResult({
            success: obj.success,
            error: obj.error,
            contacts: obj.contacts,
            drafts: obj.drafts,
            runFolderName: obj.runFolderName,
          });
        }
      } catch {
        // ignore
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact / Outreach Agent</CardTitle>
        <p className="text-muted-foreground text-sm">
          Run the Deep Outreach Research pipeline for a job: discover contacts (job page, company,
          DuckDuckGo, LinkedIn), rank and verify, infer email patterns, and generate 2–3 outreach
          variants per channel. Data is stored under <code>data_outreach_research/</code>.
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Run the seed script first for the 2 DB links:{' '}
          <code>node packages/db/scripts/seed-outreach-test-jobs.mjs</code>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="URL of a job posting..."
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            disabled={running}
            className="flex-1"
          />
          <Button type="submit" disabled={running || !jobUrl.trim()}>
            {running ? 'Running...' : 'Run Pipeline'}
          </Button>
        </form>

        {logs.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs max-h-60 overflow-y-auto">
            {logs.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">{entry.ts.slice(11, 19)}</span>
                <span
                  className={
                    entry.level === 'error'
                      ? 'text-red-600'
                      : entry.level === 'success'
                        ? 'text-green-600'
                        : ''
                  }
                >
                  [{entry.level}]
                </span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        )}

        {result != null && (
          <div
            className={`rounded-md border p-3 text-sm ${
              result.success
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 text-green-800 dark:text-green-200'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 text-red-800 dark:text-red-200'
            }`}
          >
            {result.success ? (
              <>
                <p className="font-medium">Run completed.</p>
                {result.runFolderName && (
                  <p className="mt-1 text-muted-foreground">Folder: {result.runFolderName}</p>
                )}
                {result.contacts != null && Array.isArray(result.contacts) && (
                  <div className="mt-2">
                    <p className="mt-1 font-semibold">
                      Contacts ({result.contacts.length}):
                    </p>
                    {result.contacts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {result.contacts.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm border-b border-muted/50 pb-1 last:border-0">
                            <span className="text-muted-foreground font-mono w-4">{i + 1}</span>
                            {c.linkedinUrl ? (
                              <a
                                href={c.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {c.name ?? '—'}
                              </a>
                            ) : (
                              <span className="font-medium">{c.name ?? '—'}</span>
                            )}
                            {(c.contactRole || c.role) && (
                              <span className="text-muted-foreground">
                                [{c.contactRole || c.role}]
                              </span>
                            )}
                            {c.email && (
                              <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-auto">
                                {c.email}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {result.drafts != null && (
                  <p className="mt-1">
                    Drafts: {Array.isArray(result.drafts) ? result.drafts.length : '—'}
                  </p>
                )}
              </>
            ) : (
              <p>{result.error ?? 'Unknown error'}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
