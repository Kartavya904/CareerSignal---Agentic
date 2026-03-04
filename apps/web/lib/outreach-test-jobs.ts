/**
 * Test job postings for the Deep Outreach Research Pipeline (admin panel).
 * - OUTREACH_DB_TEST_JOBS: 2 jobs loaded from DB (run seed script first). Clicking skips extraction and runs contact scraping only.
 * - OUTREACH_TEST_JOBS: 5 generic test jobs (company must exist in DB).
 */

export interface OutreachTestJob {
  id: string;
  jobUrl: string;
  companyName: string;
  title?: string;
}

/** Apply URL used to look up job_listings.dedupe_key. Must match seed script. */
export interface OutreachDbTestJob {
  id: string;
  applyUrl: string;
  companyName: string;
  title: string;
}

export const OUTREACH_DB_TEST_JOBS: OutreachDbTestJob[] = [
  {
    id: 'db-hrt',
    applyUrl:
      'https://www.hudsonrivertrading.com/hrt-job/software-engineer-c-or-python-2026-grads-3/',
    companyName: 'Hudson River Trading',
    title: 'Software Engineer (C++ or Python) - 2026 Grads',
  },
  {
    id: 'db-ibm',
    applyUrl: 'https://jobs.ibm.com/',
    companyName: 'IBM',
    title: 'Software Engineer (sample)',
  },
];

export const OUTREACH_TEST_JOBS: OutreachTestJob[] = [
  {
    id: 'test-1',
    jobUrl: 'https://careers.google.com/jobs/results/',
    companyName: 'Google',
    title: 'Software Engineer (sample)',
  },
  {
    id: 'test-2',
    jobUrl: 'https://careers.microsoft.com/',
    companyName: 'Microsoft',
    title: 'Engineering (sample)',
  },
  {
    id: 'test-3',
    jobUrl: 'https://www.amazon.jobs/',
    companyName: 'Amazon',
    title: 'Tech roles (sample)',
  },
  {
    id: 'test-4',
    jobUrl: 'https://www.metacareers.com/jobs',
    companyName: 'Meta (Facebook)',
    title: 'Engineering (sample)',
  },
  {
    id: 'test-5',
    jobUrl: 'https://jobs.ibm.com/',
    companyName: 'IBM',
    title: 'Software (sample)',
  },
];
