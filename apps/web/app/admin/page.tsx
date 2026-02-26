'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

type ConnectorKey = 'GREENHOUSE' | 'LEVER' | 'ASHBY';

export default function AdminTestingPage() {
  const [logs, setLogs] = React.useState<string[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [connectors, setConnectors] = React.useState<ConnectorKey[]>(['GREENHOUSE']);

  const handleStart = async () => {
    const selected: ConnectorKey[] = connectors.length === 0 ? ['GREENHOUSE'] : connectors;
    setIsRunning(true);
    setError(null);
    setLogs([
      `Starting testing run for connectors: ${selected.join(
        ', ',
      )}. Probing companies, this may take a few minutes…`,
    ]);
    try {
      for (const connector of selected) {
        setLogs((prev) => [...prev, '', `=== Connector: ${connector} ===`]);
        const res = await fetch('/api/admin/testing/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connector }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data.error ?? `Request failed (${res.status})`;
          setError(msg);
          setLogs((prev) => [...prev, `Error for ${connector}: ${msg}`]);
          continue;
        }
        if (Array.isArray(data.logs)) {
          setLogs((prev) => [...prev, ...data.logs]);
        } else {
          setLogs((prev) => [...prev, `No logs in response for ${connector}.`]);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setError(msg);
      setLogs((prev) => [...prev, `Request failed: ${msg}`]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Testing & Logs</CardTitle>
          <p className="text-muted-foreground text-sm">
            Kick off scraping runs and inspect detailed logs for each step. Choose which
            connector(s) to run for this test.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Connectors:</span>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={connectors.includes('GREENHOUSE')}
                onChange={(e) =>
                  setConnectors((prev) =>
                    e.target.checked
                      ? Array.from(new Set([...prev, 'GREENHOUSE']))
                      : prev.filter((c) => c !== 'GREENHOUSE'),
                  )
                }
                disabled={isRunning}
              />
              <span>Greenhouse</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={connectors.includes('LEVER')}
                onChange={(e) =>
                  setConnectors((prev) =>
                    e.target.checked
                      ? Array.from(new Set([...prev, 'LEVER']))
                      : prev.filter((c) => c !== 'LEVER'),
                  )
                }
                disabled={isRunning}
              />
              <span>Lever</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={connectors.includes('ASHBY')}
                onChange={(e) =>
                  setConnectors((prev) =>
                    e.target.checked
                      ? Array.from(new Set([...prev, 'ASHBY']))
                      : prev.filter((c) => c !== 'ASHBY'),
                  )
                }
                disabled={isRunning}
              />
              <span>Ashby</span>
            </label>
          </div>
        </div>
        <Button onClick={handleStart} disabled={isRunning}>
          {isRunning ? 'Running…' : 'Start scraping'}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="h-80 overflow-auto rounded border bg-muted px-3 py-2 text-xs font-mono">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">
              Click &quot;Start scraping&quot; to run the Greenhouse connector and stream
              step-by-step logs here.
            </p>
          ) : (
            <pre className="whitespace-pre-wrap">{logs.join('\n')}</pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
