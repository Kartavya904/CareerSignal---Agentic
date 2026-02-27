'use client';

import * as React from 'react';
import {
  Link2,
  ChevronDown,
  ChevronRight,
  Settings2,
  Fingerprint,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BudgetConfigDialog, type TestBudget } from './BudgetConfigDialog';

type Company = {
  id: string;
  name: string;
  kind: string | null;
  type: string;
  url: string;
  isPriorityTarget: boolean | null;
  enabledForScraping: boolean | null;
  testBudget?: TestBudget | null;
  atsType?: string | null;
};

type Props = {
  companies: Company[];
};

export function CatalogByKind({ companies }: Props) {
  const [enabledById, setEnabledById] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const c of companies) {
      initial[c.id] = Boolean(c.enabledForScraping);
    }
    return initial;
  });

  const [openKinds, setOpenKinds] = React.useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [budgetDialogCompany, setBudgetDialogCompany] = React.useState<{
    id: string;
    name: string;
    testBudget: TestBudget | null | undefined;
  } | null>(null);
  const [budgetById, setBudgetById] = React.useState<Record<string, TestBudget | null>>({});
  const [fingerprintById, setFingerprintById] = React.useState<
    Record<string, { atsType: string; connectorConfig?: Record<string, unknown> | null }>
  >({});

  const groups = React.useMemo(() => {
    const map = new Map<string, Company[]>();
    for (const c of companies) {
      const key = (c.kind ?? 'Uncategorized').trim() || 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => {
      const aKey = a.toLowerCase();
      const bKey = b.toLowerCase();
      // Force company_careers to the top
      const special = 'company_careers';
      const aIsSpecial = aKey === special;
      const bIsSpecial = bKey === special;
      if (aIsSpecial && !bIsSpecial) return -1;
      if (!aIsSpecial && bIsSpecial) return 1;
      return a.localeCompare(b);
    });
    return entries;
  }, [companies]);

  const toggleKind = (kind: string) => {
    setOpenKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const handleToggle = async (id: string, nextEnabled: boolean) => {
    setEnabledById((prev) => ({ ...prev, [id]: nextEnabled }));
    setPendingId(id);
    try {
      const res = await fetch(`/api/admin/companies/${id}/scraping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
    } catch (e) {
      setEnabledById((prev) => ({ ...prev, [id]: !nextEnabled }));
      console.error(e);
      toast.error('Failed to update enabled_for_scraping');
    } finally {
      setPendingId((prev) => (prev === id ? null : prev));
    }
  };

  const handleStubAction = async (id: string, action: 'fingerprint' | 'scrape' | 'enrich') => {
    const path =
      action === 'fingerprint' ? 'fingerprint' : action === 'scrape' ? 'scrape' : 'enrich';
    try {
      const res = await fetch(`/api/admin/companies/${id}/${path}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && action === 'fingerprint' && data.fingerprint) {
        setFingerprintById((prev) => ({
          ...prev,
          [id]: {
            atsType: data.fingerprint.atsType,
            connectorConfig: data.fingerprint.connectorConfig ?? undefined,
          },
        }));
        toast.success(`Detected: ${data.fingerprint.atsType}`);
      } else if (res.ok && action === 'scrape') {
        const msg =
          data.jobsUpserted != null ? `Scraped: ${data.jobsUpserted} job(s)` : 'Scrape finished';
        toast.success(data.errors?.length ? `${msg} (with warnings)` : msg);
      } else if (res.status === 501) {
        toast.info(data.error ?? 'Not implemented yet');
      } else if (!res.ok) {
        toast.error(data.error ?? `Request failed (${res.status})`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Request failed');
    }
  };

  const getBudget = (c: Company) =>
    budgetById[c.id] !== undefined ? budgetById[c.id] : c.testBudget;

  const getAtsType = (c: Company) => fingerprintById[c.id]?.atsType ?? c.atsType ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalog</CardTitle>
        <p className="text-muted-foreground text-sm">
          Grouped by <code>kind</code>. Each row shows only the name, a link icon, and an enable
          toggle. A small green dot marks priority targets.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No rows. Run <code className="rounded bg-muted px-1">npm run sources:import</code> to
            seed from CSV.
          </p>
        ) : (
          groups.map(([kind, items]) => {
            const isOpen = openKinds[kind] ?? false;
            return (
              <div
                key={kind}
                className="rounded-lg border border-border bg-card/40 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleKind(kind)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      {kind}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({items.length})
                      </span>
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="divide-y divide-border/70">
                    {items.map((c) => {
                      const enabled = enabledById[c.id] ?? false;
                      const isPriority = Boolean(c.isPriorityTarget);
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            'relative flex items-center justify-between px-3 py-2',
                            'hover:bg-muted/40',
                          )}
                        >
                          {isPriority && (
                            <span
                              className="pointer-events-none absolute left-2 top-2 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.9)]"
                              aria-hidden="true"
                            />
                          )}
                          <div className="flex flex-wrap items-center gap-2 pl-2">
                            <button
                              type="button"
                              className="text-sm font-medium text-foreground hover:underline"
                            >
                              {c.name}
                            </button>
                            {getAtsType(c) && getAtsType(c) !== 'UNKNOWN' && (
                              <Badge variant="secondary" className="text-xs font-normal">
                                {getAtsType(c)}
                              </Badge>
                            )}
                            {c.url && (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center text-muted-foreground hover:text-primary"
                                aria-label="Open source URL"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pr-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => handleStubAction(c.id, 'fingerprint')}
                              title="Detect ATS from URL"
                            >
                              <Fingerprint className="h-3.5 w-3.5" />
                              Fingerprint
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => handleStubAction(c.id, 'scrape')}
                              title="Fetch jobs now (Greenhouse only)"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Scrape
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() =>
                                setBudgetDialogCompany({
                                  id: c.id,
                                  name: c.name,
                                  testBudget: getBudget(c),
                                })
                              }
                              title="Configure per-source scrape budget"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              Budget
                            </Button>
                            {c.type === 'COMPANY' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => handleStubAction(c.id, 'enrich')}
                                title="Run enrichment (stub)"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Enrich
                              </Button>
                            )}
                            <Switch
                              checked={enabled}
                              onCheckedChange={(val) => handleToggle(c.id, val)}
                              disabled={pendingId === c.id}
                              aria-label="Enable scraping"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
      {budgetDialogCompany && (
        <BudgetConfigDialog
          open={!!budgetDialogCompany}
          onOpenChange={(open) => !open && setBudgetDialogCompany(null)}
          companyId={budgetDialogCompany.id}
          companyName={budgetDialogCompany.name}
          initialBudget={budgetDialogCompany.testBudget}
          onSaved={(budget) =>
            setBudgetById((prev) => ({
              ...prev,
              [budgetDialogCompany.id]: budget ?? null,
            }))
          }
        />
      )}
    </Card>
  );
}
