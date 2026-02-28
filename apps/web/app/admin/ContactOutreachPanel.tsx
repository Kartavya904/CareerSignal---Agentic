'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Placeholder panel for the Contact / Outreach agent.
 * Allows testing the agent once the pipeline is implemented.
 * Mirrors the pattern of DeepCompanyResearchPanel.
 */
export function ContactOutreachPanel() {
  const [jobUrl, setJobUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);

  async function handleTest() {
    const url = jobUrl.trim();
    if (!url) return;
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/contact-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobUrl: url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          type: 'error',
          text: data.error ?? data.message ?? res.statusText ?? 'Request failed',
        });
        return;
      }
      if (data.placeholder) {
        setMessage({
          type: 'info',
          text:
            data.message ?? 'Contact pipeline is not yet built. This is a placeholder for testing.',
        });
        return;
      }
      setMessage({
        type: 'success',
        text: data.message ?? 'Contact pipeline run completed.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ type: 'error', text: `Request failed: ${msg}` });
    } finally {
      setRunning(false);
    }
  }

  const messageClass =
    message?.type === 'error'
      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 text-red-800 dark:text-red-200'
      : message?.type === 'success'
        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 text-green-800 dark:text-green-200'
        : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact / Outreach Agent</CardTitle>
        <p className="text-muted-foreground text-sm">
          Run the contact discovery and outreach pipeline for a job: find relevant contacts (hiring
          manager, recruiters, team leads) from public signals and generate outreach drafts. This
          agent will be the third major pipeline alongside Application Assistant and Deep Company
          Research.
        </p>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Placeholder</p>
          <p className="text-muted-foreground mt-1 text-xs">
            The contact pipeline is not yet implemented. Use this panel to test the flow once it is
            built. You can paste a job URL to run contact discovery and outreach generation.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label htmlFor="admin-contact-job-url" className="text-sm font-medium leading-none">
              Job URL
            </label>
            <Input
              id="admin-contact-job-url"
              placeholder="e.g. https://jobs.example.com/role/123"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
              disabled={running}
              className="min-w-[280px]"
            />
          </div>
          <Button onClick={handleTest} disabled={running || !jobUrl.trim()}>
            {running ? 'Running…' : 'Test Contact Pipeline'}
          </Button>
        </div>

        {message && (
          <div className={`rounded-md border p-3 text-sm ${messageClass}`}>{message.text}</div>
        )}
      </CardContent>
    </Card>
  );
}
