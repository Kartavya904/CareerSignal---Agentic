import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDb, getCompanyById, listJobListings } from '@careersignal/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function CompanyJobsPage({ params }: { params: { id: string } }) {
  const db = getDb();
  const company = await getCompanyById(db, params.id);
  if (!company) notFound();

  const jobs = await listJobListings(db, { companyId: params.id, limit: 500 });

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <div>
          <CardTitle>Jobs for {company.name}</CardTitle>
          <p className="text-muted-foreground text-sm">
            Showing up to {jobs.length} job postings cached for this company.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/companies">Back to companies</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No job postings found for this company yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Posted</th>
                  <th className="py-2 pr-4">Last seen</th>
                  <th className="py-2 pr-4">Links</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{job.title}</td>
                    <td className="py-2 pr-4">{job.location ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {job.status ?? 'UNKNOWN'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {job.postedAt ? new Date(job.postedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {job.lastSeenAt ? new Date(job.lastSeenAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground space-x-2">
                      {job.jobUrl && (
                        <a href={job.jobUrl} target="_blank" rel="noreferrer" className="underline">
                          Job
                        </a>
                      )}
                      {job.applyUrl && job.applyUrl !== job.jobUrl && (
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Apply
                        </a>
                      )}
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
