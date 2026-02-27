'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export type TestBudget = {
  max_pages?: number;
  max_jobs?: number;
  timeout_ms?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  initialBudget: TestBudget | null | undefined;
  onSaved?: (budget: TestBudget | null) => void;
};

export function BudgetConfigDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  initialBudget,
  onSaved,
}: Props) {
  const [maxPages, setMaxPages] = React.useState(String(initialBudget?.max_pages ?? ''));
  const [maxJobs, setMaxJobs] = React.useState(String(initialBudget?.max_jobs ?? ''));
  const [timeoutMs, setTimeoutMs] = React.useState(String(initialBudget?.timeout_ms ?? ''));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMaxPages(String(initialBudget?.max_pages ?? ''));
      setMaxJobs(String(initialBudget?.max_jobs ?? ''));
      setTimeoutMs(String(initialBudget?.timeout_ms ?? ''));
    }
  }, [open, initialBudget]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: TestBudget = {};
      const mp = maxPages.trim() ? parseInt(maxPages, 10) : undefined;
      const mj = maxJobs.trim() ? parseInt(maxJobs, 10) : undefined;
      const tm = timeoutMs.trim() ? parseInt(timeoutMs, 10) : undefined;
      if (mp !== undefined && !Number.isNaN(mp)) body.max_pages = mp;
      if (mj !== undefined && !Number.isNaN(mj)) body.max_jobs = mj;
      if (tm !== undefined && !Number.isNaN(tm)) body.timeout_ms = tm;

      const res = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_budget: Object.keys(body).length === 0 ? null : body,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const result = await res.json();
      onSaved?.(result.testBudget ?? null);
      onOpenChange(false);
      toast.success('Budget saved');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure budget — {companyName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <label htmlFor="max_pages" className="text-sm font-medium text-foreground">
              Max pages
            </label>
            <Input
              id="max_pages"
              type="number"
              min={0}
              placeholder="e.g. 5"
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="max_jobs" className="text-sm font-medium text-foreground">
              Max jobs
            </label>
            <Input
              id="max_jobs"
              type="number"
              min={0}
              placeholder="e.g. 100"
              value={maxJobs}
              onChange={(e) => setMaxJobs(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="timeout_ms" className="text-sm font-medium text-foreground">
              Timeout (ms)
            </label>
            <Input
              id="timeout_ms"
              type="number"
              min={0}
              placeholder="e.g. 30000"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
