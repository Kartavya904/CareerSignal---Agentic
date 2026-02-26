import Link from 'next/link';
import { getDb, listCompanies } from '@careersignal/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminCompaniesPage() {
  const db = getDb();
  const all = await listCompanies(db, { type: 'COMPANY' });
  const companies = all.filter((c) => (c.jobCountTotal ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies with extracted jobs</CardTitle>
        <p className="text-muted-foreground text-sm">
          This list only shows companies where the pipeline has actually written jobs into the
          cache. New companies appear here once jobs are extracted.
        </p>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No companies have jobs yet. After scraping runs, companies will appear here once jobs
            are written.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Jobs (open / total)</th>
                  <th className="py-2 pr-4">Last scraped</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4">
                      {c.jobCountOpen ?? 0} / {c.jobCountTotal ?? 0}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {c.lastScrapedAt ? new Date(c.lastScrapedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {c.lastStatus ?? 'UNKNOWN'}
                    </td>
                    <td className="py-2 pr-4">
                      <Button asChild variant="outline" size="xs">
                        <Link href={`/admin/companies/${c.id}/jobs`}>View jobs</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
