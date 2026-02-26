'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CompanyForFingerprint = {
  id: string;
  name: string;
  url: string;
};

export function FingerprintAllButton() {
  const [running, setRunning] = useState(false);

  const handleClick = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await fetch('/api/admin/companies');
      if (!res.ok) {
        throw new Error(`Failed to load companies (${res.status})`);
      }
      const companies = (await res.json()) as CompanyForFingerprint[];
      const targets = companies.filter((c) => c.url);
      if (targets.length === 0) {
        toast.info('No companies with URLs to fingerprint.');
        setRunning(false);
        return;
      }

      let ok = 0;
      let failed = 0;
      for (const c of targets) {
        try {
          const r = await fetch(`/api/admin/companies/${c.id}/fingerprint`, {
            method: 'POST',
          });
          if (r.ok) ok++;
          else failed++;
        } catch {
          failed++;
        }
      }

      toast.success(`Fingerprint complete: ${ok} ok, ${failed} failed`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Fingerprint all failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={running}
      className="gap-1.5"
    >
      {running ? 'Fingerprinting…' : 'Fingerprint all'}
    </Button>
  );
}
