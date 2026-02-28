/**
 * Page Classifier Agent — Classifies captured pages by type.
 *
 * Extended type set for job-search context. Uses code-first heuristics
 * with optional LLM fallback for ambiguous pages.
 *
 * Job-scope bias: when in doubt, prefer types that keep us in job-seeking flow.
 */

import { complete } from '@careersignal/llm';

export type PageType =
  | 'listing'
  | 'detail'
  | 'category_listing'
  | 'company_careers'
  | 'pagination'
  | 'search_landing'
  | 'login_wall'
  | 'captcha_challenge'
  | 'error'
  | 'expired'
  | 'external_apply'
  | 'irrelevant'
  | 'duplicate_canonical';

export const ALL_PAGE_TYPES: PageType[] = [
  'listing',
  'detail',
  'category_listing',
  'company_careers',
  'pagination',
  'search_landing',
  'login_wall',
  'captcha_challenge',
  'error',
  'expired',
  'external_apply',
  'irrelevant',
  'duplicate_canonical',
];

export interface ClassificationResult {
  type: PageType;
  confidence: number;
  method: 'heuristic' | 'llm';
  signals: string[];
}

interface HeuristicScore {
  type: PageType;
  score: number;
  signals: string[];
}

const HEURISTIC_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Classify a page. Heuristics first; LLM only when confidence < threshold.
 */
export async function classifyPage(
  html: string,
  url: string,
  options?: { useLlm?: boolean; statusCode?: number },
): Promise<ClassificationResult> {
  const scores = runHeuristics(html, url, options?.statusCode);
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score === 0) {
    if (options?.useLlm !== false) {
      return classifyWithLlm(html, url);
    }
    return { type: 'irrelevant', confidence: 0.3, method: 'heuristic', signals: ['no_signals'] };
  }

  if (best.score >= HEURISTIC_CONFIDENCE_THRESHOLD) {
    return {
      type: best.type,
      confidence: Math.min(0.95, best.score),
      method: 'heuristic',
      signals: best.signals,
    };
  }

  if (options?.useLlm !== false) {
    return classifyWithLlm(html, url);
  }

  return {
    type: best.type,
    confidence: best.score,
    method: 'heuristic',
    signals: best.signals,
  };
}

const KNOWN_NON_JOB_DOMAINS = [
  'google.com',
  'youtube.com',
  'wikipedia.org',
  'openai.com',
  'github.com',
];

function runHeuristics(html: string, url: string, statusCode?: number): HeuristicScore[] {
  const lower = html.toLowerCase();
  const urlLower = url.toLowerCase();
  const htmlLen = html.length;
  const scores: HeuristicScore[] = [];

  // --- Irrelevant (known non-job domains) — check first so they never score as listing/detail ---
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (KNOWN_NON_JOB_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) {
      scores.push({ type: 'irrelevant', score: 0.95, signals: ['known_non_job_domain'] });
    }
  } catch {
    // invalid URL
  }

  // --- Error ---
  {
    const signals: string[] = [];
    let score = 0;
    if (statusCode && (statusCode === 404 || statusCode >= 500)) {
      score += 0.8;
      signals.push(`status_${statusCode}`);
    }
    if (lower.includes('page not found') || lower.includes('404')) {
      score += 0.3;
      signals.push('not_found_text');
    }
    if (lower.includes('500') && lower.includes('error')) {
      score += 0.3;
      signals.push('server_error_text');
    }
    if (htmlLen < 3000 && (lower.includes('not found') || lower.includes('does not exist'))) {
      score += 0.3;
      signals.push('short_error_page');
    }
    scores.push({ type: 'error', score, signals });
  }

  // --- Captcha ---
  {
    const signals: string[] = [];
    let score = 0;
    const captchaPhrases = [
      'verify you are human',
      'complete the captcha',
      'captcha challenge',
      'solve the captcha',
      'please verify',
    ];
    for (const phrase of captchaPhrases) {
      if (lower.includes(phrase)) {
        score += 0.4;
        signals.push(`captcha_phrase:${phrase}`);
      }
    }
    if (htmlLen < 5000 && score > 0) {
      score += 0.2;
      signals.push('small_html_captcha');
    }
    scores.push({ type: 'captcha_challenge', score, signals });
  }

  // --- Login Wall ---
  {
    const signals: string[] = [];
    let score = 0;
    const loginPhrases = [
      'sign in to continue',
      'log in to continue',
      'login required',
      'please sign in',
      'please log in',
    ];
    for (const phrase of loginPhrases) {
      if (lower.includes(phrase)) {
        score += 0.35;
        signals.push(`login_phrase:${phrase}`);
      }
    }
    if (
      lower.includes('<form') &&
      (lower.includes('password') || lower.includes('email')) &&
      !lower.includes('/jobs/')
    ) {
      score += 0.25;
      signals.push('login_form_detected');
    }
    if (urlLower.includes('/login') || urlLower.includes('/signin') || urlLower.includes('/auth')) {
      score += 0.3;
      signals.push('login_url');
    }
    scores.push({ type: 'login_wall', score, signals });
  }

  // --- Expired ---
  {
    const signals: string[] = [];
    let score = 0;
    const expiredPhrases = [
      'no longer available',
      'job has been removed',
      'position has been filled',
      'listing has expired',
      'this job is closed',
    ];
    for (const phrase of expiredPhrases) {
      if (lower.includes(phrase)) {
        score += 0.4;
        signals.push(`expired_phrase:${phrase}`);
      }
    }
    scores.push({ type: 'expired', score, signals });
  }

  // --- Job Detail ---
  {
    const signals: string[] = [];
    let score = 0;
    // Wellfound-style and generic job/application URL patterns
    if (
      /\/jobs\/\d+-/.test(urlLower) ||
      /\/job\/\d+/.test(urlLower) ||
      /\/jobs\/view\/\d+/.test(urlLower) ||
      /\/careers?\/details?\//.test(urlLower) ||
      /\/career\/[^/]+/.test(urlLower) ||
      /\/position\/[^/]+/.test(urlLower) ||
      /\/opening\/[^/]+/.test(urlLower) ||
      /\/vacancy\/[^/]+/.test(urlLower) ||
      /\/job\/[^/]+/.test(urlLower) ||
      /\/jobs\/[^/?#]+/.test(urlLower)
    ) {
      score += 0.5;
      signals.push('detail_url_pattern');
    }
    const h1Count = (lower.match(/<h1/g) || []).length;
    if (h1Count === 1 && htmlLen > 5000) {
      score += 0.15;
      signals.push('single_h1');
    }
    if (
      lower.includes('apply now') ||
      lower.includes('apply for this') ||
      lower.includes('start application') ||
      lower.includes('submit application')
    ) {
      score += 0.2;
      signals.push('apply_button');
    }
    if (
      lower.includes('attach') &&
      (lower.includes('resume') || lower.includes('cv') || lower.includes('curriculum'))
    ) {
      score += 0.25;
      signals.push('attach_resume');
    }
    if (
      lower.includes('job description') ||
      lower.includes('responsibilities') ||
      lower.includes('requirements') ||
      lower.includes('your objectives') ||
      lower.includes('skills & talents')
    ) {
      score += 0.15;
      signals.push('jd_keywords');
    }
    // Salary/compensation often on real job pages
    if (
      lower.includes('salary') ||
      lower.includes('compensation') ||
      lower.includes('per week') ||
      lower.includes('base salary range') ||
      /\$[\d,]+(\s*to|-)\s*\$[\d,]+/.test(lower)
    ) {
      score += 0.2;
      signals.push('salary_mentioned');
    }
    const jobLinkCount = (lower.match(/\/jobs\/\d+-/g) || []).length;
    if (jobLinkCount <= 3) {
      score += 0.1;
      signals.push('few_job_links');
    }
    scores.push({ type: 'detail', score, signals });
  }

  // --- Listing ---
  {
    const signals: string[] = [];
    let score = 0;
    const jobLinks = (lower.match(/\/jobs\/\d+-/g) || []).length;
    if (jobLinks >= 5) {
      score += 0.5;
      signals.push(`many_job_links:${jobLinks}`);
    } else if (jobLinks >= 2) {
      score += 0.25;
      signals.push(`some_job_links:${jobLinks}`);
    }
    if (
      urlLower.endsWith('/jobs') ||
      urlLower.includes('/jobs?') ||
      urlLower.includes('/jobs/search')
    ) {
      score += 0.3;
      signals.push('listing_url_pattern');
    }
    if (
      lower.includes('job-card') ||
      lower.includes('job-listing') ||
      lower.includes('jobposting')
    ) {
      score += 0.15;
      signals.push('job_card_class');
    }
    scores.push({ type: 'listing', score, signals });
  }

  // --- Company Careers ---
  {
    const signals: string[] = [];
    let score = 0;
    if (/\/company\/[^/]+\/?$/.test(urlLower) || /\/company\/[^/]+\/jobs/.test(urlLower)) {
      score += 0.4;
      signals.push('company_url_pattern');
    }
    if (
      lower.includes('open positions') ||
      lower.includes('view jobs') ||
      lower.includes('see all jobs')
    ) {
      score += 0.25;
      signals.push('company_jobs_cta');
    }
    scores.push({ type: 'company_careers', score, signals });
  }

  // --- Category Listing ---
  {
    const signals: string[] = [];
    let score = 0;
    if (/\/role\/|\/category\/|\/department\//.test(urlLower)) {
      score += 0.4;
      signals.push('category_url_pattern');
    }
    if (
      lower.includes('engineering jobs') ||
      lower.includes('remote jobs') ||
      lower.includes('marketing jobs')
    ) {
      score += 0.2;
      signals.push('category_heading');
    }
    const jobLinks = (lower.match(/\/jobs\/\d+-/g) || []).length;
    if (jobLinks >= 3 && score > 0) {
      score += 0.2;
      signals.push('has_job_links_in_category');
    }
    scores.push({ type: 'category_listing', score, signals });
  }

  // --- Pagination ---
  {
    const signals: string[] = [];
    let score = 0;
    if (/[?&]page=\d+/.test(urlLower) && !/page=1\b/.test(urlLower)) {
      score += 0.5;
      signals.push('pagination_url');
    }
    if (lower.includes('next page') || lower.includes('load more') || lower.includes('show more')) {
      score += 0.15;
      signals.push('pagination_text');
    }
    scores.push({ type: 'pagination', score, signals });
  }

  // --- Search Landing ---
  {
    const signals: string[] = [];
    let score = 0;
    if (lower.includes('search') && (lower.includes('<form') || lower.includes('search-input'))) {
      score += 0.2;
      signals.push('search_form');
    }
    const jobLinks = (lower.match(/\/jobs\/\d+-/g) || []).length;
    if (jobLinks === 0 && score > 0) {
      score += 0.2;
      signals.push('no_results');
    }
    scores.push({ type: 'search_landing', score, signals });
  }

  // --- External Apply ---
  {
    const signals: string[] = [];
    let score = 0;
    const externalDomains = [
      'greenhouse.io',
      'lever.co',
      'workday.com',
      'icims.com',
      'smartrecruiters.com',
      'ashbyhq.com',
    ];
    for (const domain of externalDomains) {
      if (urlLower.includes(domain)) {
        score += 0.7;
        signals.push(`external_ats:${domain}`);
      }
    }
    scores.push({ type: 'external_apply', score, signals });
  }

  // --- Irrelevant ---
  {
    const signals: string[] = [];
    let score = 0;
    const irrelevantPaths = ['/blog', '/about', '/privacy', '/terms', '/contact', '/faq', '/help'];
    for (const p of irrelevantPaths) {
      if (urlLower.includes(p)) {
        score += 0.4;
        signals.push(`irrelevant_path:${p}`);
      }
    }
    const jobLinks = (lower.match(/\/jobs\/\d+-/g) || []).length;
    if (
      jobLinks === 0 &&
      !lower.includes('career') &&
      !lower.includes('position') &&
      !lower.includes('hiring')
    ) {
      score += 0.15;
      signals.push('no_job_signals');
    }
    scores.push({ type: 'irrelevant', score, signals });
  }

  return scores;
}

async function classifyWithLlm(html: string, url: string): Promise<ClassificationResult> {
  const snippet = html.substring(0, 8000);
  const linkCount = (html.match(/<a\s/gi) || []).length;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const prompt = `Classify this web page into exactly one type for a job scraping system.

URL: ${url}
Title: ${title}
Link count: ${linkCount}
HTML size: ${html.length} chars

Types (pick one):
- listing: Multiple job cards/links (main jobs page)
- detail: Single job full description
- category_listing: Category/role-specific listing (Engineering, Remote, etc.)
- company_careers: Company hub with links to jobs
- pagination: Next page / continuation
- search_landing: Search form with no/few results
- login_wall: Must sign in to see content
- captcha_challenge: CAPTCHA / verification page
- error: 404, 500, broken page
- expired: Job no longer available
- external_apply: External ATS (Greenhouse, Lever, etc.)
- irrelevant: Non-job content (blog, about, etc.)

HTML snippet:
${snippet}

Return JSON: { "type": "<type>", "confidence": 0.0-1.0 }`;

  try {
    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 128,
      timeout: 180000, // 3 min minimum for application assistant
    });
    const parsed = JSON.parse(response) as { type?: string; confidence?: number };
    const type = ALL_PAGE_TYPES.includes(parsed.type as PageType)
      ? (parsed.type as PageType)
      : 'irrelevant';
    return {
      type,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      method: 'llm',
      signals: ['llm_classification'],
    };
  } catch {
    return { type: 'irrelevant', confidence: 0.3, method: 'heuristic', signals: ['llm_failed'] };
  }
}
