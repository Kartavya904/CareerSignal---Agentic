/**
 * Job Detail Extractor Agent — Extracts a single job posting from a page.
 *
 * Used by Application Assistant to extract structured job data from one
 * application/job-detail page. Prefers JSON-LD JobPosting; falls back to
 * LLM extraction with a fixed schema.
 */

import { complete } from '@careersignal/llm';

export interface JobDetail {
  title: string;
  company: string;
  companyOneLiner: string | null;
  location: string | null;
  salary: string | null;
  description: string;
  requirements: string[];
  postedDate: string | null;
  deadline: string | null;
  employmentType: string | null;
  remoteType: string | null;
  seniority: string | null;
  applyUrl: string | null;
  department: string | null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Derive company name from ATS URL slug when page doesn't provide it (e.g. Lever). */
function companyFromUrlSlug(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    const path = u.pathname.replace(/\/$/, '');
    // jobs.lever.co/nuwaves/... -> nuwaves
    const leverMatch = path.match(/^\/?([^/]+)\/[a-f0-9-]+/i);
    if (leverMatch && u.hostname.includes('lever.co')) {
      const slug = leverMatch[1];
      return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    // job-boards.greenhouse.io/wight/jobs/... -> wight
    const ghMatch = path.match(/\/jobs\/(\d+)/i) && path.match(/^\/([^/]+)\//);
    if (ghMatch && u.hostname.includes('greenhouse.io')) {
      const slug = (path.split('/')[1] || '').trim();
      if (slug) return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    // apply.workable.com/company/j/... -> company
    const workableMatch = u.hostname.includes('workable.com') && path.match(/^\/([^/]+)\//);
    if (workableMatch) {
      const slug = (path.split('/')[1] || '').trim();
      if (slug && slug !== 'j')
        return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    // ignore
  }
  return null;
}

function tryJsonLd(html: string, pageUrl: string): JobDetail | null {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const candidates: unknown[] = [];
        candidates.push(item);
        if (item && typeof item === 'object' && '@graph' in item) {
          const graph = (item as Record<string, unknown>)['@graph'];
          if (Array.isArray(graph)) candidates.push(...graph);
        }
        for (const c of candidates) {
          if (!c || typeof c !== 'object') continue;
          const t = (c as Record<string, unknown>)['@type'];
          const isJobPosting =
            t === 'JobPosting' || (Array.isArray(t) && (t as unknown[]).includes('JobPosting'));
          if (!isJobPosting) continue;
          return {
            title: (c as any).title || 'Untitled',
            company: (c as any).hiringOrganization?.name || 'Unknown',
            companyOneLiner: (c as any).hiringOrganization?.description?.slice(0, 200) || null,
            location:
              (c as any).jobLocation?.address?.addressLocality ||
              (c as any).jobLocation?.name ||
              null,
            salary: formatSalary((c as any).baseSalary),
            description: stripHtmlTags((c as any).description || ''),
            requirements:
              typeof (c as any).qualifications === 'string'
                ? (c as any).qualifications.split('\n').filter(Boolean)
                : Array.isArray((c as any).qualifications)
                  ? (c as any).qualifications
                  : [],
            postedDate: (c as any).datePosted || null,
            deadline: (c as any).validThrough || null,
            employmentType: (c as any).employmentType || null,
            remoteType: (c as any).jobLocationType || null,
            seniority: (c as any).experienceRequirements?.monthsOfExperience
              ? `${Math.round(((c as any).experienceRequirements.monthsOfExperience as number) / 12)}+ years`
              : null,
            applyUrl: (c as any).url || pageUrl,
            department: (c as any).occupationalCategory || null,
          };
        }
      }
    } catch {
      // invalid JSON
    }
  }
  return null;
}

/**
 * Some job boards (e.g. SmartRecruiters) publish schema.org JobPosting via microdata
 * (itemscope/itemtype + itemprop meta tags) instead of JSON-LD.
 */
function tryMicrodata(html: string, pageUrl: string): JobDetail | null {
  const hasJobPosting =
    /itemtype=["']https?:\/\/schema\.org\/JobPosting["']/i.test(html) ||
    /itemtype=["']http:\/\/schema\.org\/JobPosting["']/i.test(html);
  if (!hasJobPosting) return null;

  const titleMatch =
    html.match(/itemprop=["']title["'][^>]*>([^<]{2,200})</i) ??
    html.match(/<meta[^>]*itemprop=["']title["'][^>]*content=["']([^"']{2,200})["']/i);
  const companyMatch =
    html.match(/<meta[^>]*itemprop=["']name["'][^>]*content=["']([^"']{2,200})["']/i) ??
    html.match(/alt=["']([^"']{2,200})\s+logo["']/i);
  const localityMatch = html.match(
    /<meta[^>]*itemprop=["']addressLocality["'][^>]*content=["']([^"']{2,200})["']/i,
  );
  const regionMatch = html.match(
    /<meta[^>]*itemprop=["']addressRegion["'][^>]*content=["']([^"']{2,200})["']/i,
  );
  const countryMatch = html.match(
    /<meta[^>]*itemprop=["']addressCountry["'][^>]*content=["']([^"']{2,200})["']/i,
  );

  const employmentTypeMatch = html.match(
    /<li[^>]*itemprop=["']employmentType["'][^>]*>([^<]{2,120})</i,
  );
  const datePostedMatch = html.match(
    /<meta[^>]*itemprop=["']datePosted["'][^>]*content=["']([^"']{2,50})["']/i,
  );
  const descriptionMatch = html.match(
    /<div[^>]*itemprop=["']description["'][^>]*>([\s\S]{200,20000}?)<\/div>/i,
  );

  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : 'Untitled';
  const company = companyMatch ? decodeHtmlEntities(companyMatch[1]) : 'Unknown';
  const locationParts = [localityMatch?.[1], regionMatch?.[1], countryMatch?.[1]]
    .filter(Boolean)
    .map((s) => decodeHtmlEntities(String(s)));
  const location = locationParts.length ? locationParts.join(', ') : null;
  const employmentType = employmentTypeMatch ? decodeHtmlEntities(employmentTypeMatch[1]) : null;
  const postedDate = datePostedMatch ? decodeHtmlEntities(datePostedMatch[1]) : null;
  const description = descriptionMatch ? stripHtmlTags(descriptionMatch[1]) : '';

  // Requirements: SmartRecruiters uses itemprop="qualifications" in a section; extract list items.
  const qualsBlockMatch = html.match(
    /itemprop=["']qualifications["'][^>]*>([\s\S]{200,20000}?)<\/section>/i,
  );
  const requirements = qualsBlockMatch
    ? Array.from(qualsBlockMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
        .map((m) => stripHtmlTags(m[1]))
        .filter((s) => s.length > 0)
        .slice(0, 40)
    : [];

  return {
    title,
    company,
    companyOneLiner: null,
    location,
    salary: null,
    description,
    requirements,
    postedDate,
    deadline: null,
    employmentType,
    remoteType: null,
    seniority: null,
    applyUrl: pageUrl,
    department: null,
  };
}

function formatSalary(baseSalary: unknown): string | null {
  if (!baseSalary || typeof baseSalary !== 'object') return null;
  const s = baseSalary as Record<string, unknown>;
  const value = s.value as Record<string, unknown> | undefined;
  if (value) {
    const min = value.minValue;
    const max = value.maxValue;
    const currency = (s.currency as string) || 'USD';
    if (min && max) return `${currency} ${min}–${max}`;
    if (min) return `${currency} ${min}+`;
  }
  return null;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Max HTML chars to send to LLM so prompt fits in ~16k context (Ollama default). */
const LLM_HTML_MAX_CHARS = 12000;
const LLM_HTML_RETRY_CHARS = 6000;

function isAbortError(e: unknown): boolean {
  return (
    e != null &&
    typeof e === 'object' &&
    ((e as { name?: string }).name === 'AbortError' ||
      (e instanceof Error && e.name === 'AbortError'))
  );
}

/**
 * Take a slice of body HTML that fits in context. Prefer the middle of the page
 * (skips nav/footer) so the main job description is included.
 */
function sliceHtmlForLlm(html: string, maxChars: number): string {
  const bodyStart = html.indexOf('<body');
  const bodyContent = bodyStart > 0 ? html.substring(bodyStart) : html;
  if (bodyContent.length <= maxChars) return bodyContent;
  const start = Math.max(0, Math.floor((bodyContent.length - maxChars) / 2));
  return bodyContent.substring(start, start + maxChars);
}

/**
 * Extract a single job posting from HTML using LLM.
 */
async function extractWithLlm(html: string, pageUrl: string): Promise<JobDetail> {
  const truncated = sliceHtmlForLlm(html, LLM_HTML_MAX_CHARS);

  const emptyDetail = (): JobDetail => ({
    title: 'Untitled',
    company: 'Unknown',
    companyOneLiner: null,
    location: null,
    salary: null,
    description: '',
    requirements: [],
    postedDate: null,
    deadline: null,
    employmentType: null,
    remoteType: null,
    seniority: null,
    applyUrl: pageUrl,
    department: null,
  });

  const runOne = async (htmlSlice: string, timeoutMs: number): Promise<JobDetail> => {
    const p = `Extract the single job posting from this page HTML. Return a JSON object with these fields:
- title: Job title (string)
- company: Company name (string)
- companyOneLiner: A one-sentence description of the company if available (string or null)
- location: Job location (string or null)
- salary: Salary/compensation info (string or null)
- description: Full job description text, no HTML (string)
- requirements: Array of requirements/qualifications (string[])
- postedDate: When posted (string or null)
- deadline: Application deadline if mentioned (string or null)
- employmentType: e.g. Full-time, Part-time, Contract (string or null)
- remoteType: Remote, Hybrid, Onsite (string or null)
- seniority: Entry, Junior, Mid, Senior, etc. (string or null)
- applyUrl: Direct apply URL if different from page URL (string or null)
- department: Department or team (string or null)

Page URL: ${pageUrl}

HTML:
${htmlSlice}`;
    const response = await complete(p, 'GENERAL', {
      format: 'json',
      temperature: 0.1,
      maxTokens: 4096,
      timeout: timeoutMs,
    });
    const parsed = JSON.parse(response);
    return {
      title: parsed.title || 'Untitled',
      company: parsed.company || 'Unknown',
      companyOneLiner: parsed.companyOneLiner || null,
      location: parsed.location || null,
      salary: parsed.salary || null,
      description: parsed.description || '',
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
      postedDate: parsed.postedDate || null,
      deadline: parsed.deadline || null,
      employmentType: parsed.employmentType || null,
      remoteType: parsed.remoteType || null,
      seniority: parsed.seniority || null,
      applyUrl: parsed.applyUrl || pageUrl,
      department: parsed.department || null,
    };
  };

  try {
    return await runOne(truncated, 300000); // 5 min for extraction (heavy step)
  } catch (err) {
    if (isAbortError(err)) {
      try {
        const smaller = sliceHtmlForLlm(html, LLM_HTML_RETRY_CHARS);
        return await runOne(smaller, 180000); // 3 min retry
      } catch {
        return emptyDetail();
      }
    }
    return emptyDetail();
  }
}

/**
 * DOM/title fallback for ATS pages that don't expose JSON-LD or microdata.
 * Greenhouse: <title>Job Application for {title} at {company}</title>
 * Lever: title/company often in og:title or page content
 * Workable: similar title patterns
 */
function tryDomFallback(html: string, pageUrl: string): JobDetail | null {
  const urlLower = pageUrl.toLowerCase();

  // Greenhouse: job-boards.greenhouse.io, boards.greenhouse.io
  if (urlLower.includes('greenhouse.io') && urlLower.includes('/jobs/')) {
    const greenhouseTitle = html.match(
      /<title[^>]*>\s*Job Application for\s+(.+?)\s+at\s+(.+?)\s*<\/title>/i,
    );
    if (greenhouseTitle) {
      const title = decodeHtmlEntities(greenhouseTitle[1].trim());
      const company = decodeHtmlEntities(greenhouseTitle[2].trim());
      if (title.length >= 2 && company.length >= 2) {
        return {
          title,
          company,
          companyOneLiner: null,
          location: null,
          salary: null,
          description: '',
          requirements: [],
          postedDate: null,
          deadline: null,
          employmentType: null,
          remoteType: null,
          seniority: null,
          applyUrl: pageUrl,
          department: null,
        };
      }
    }
    // Fallback: h1 for title, company from title "at X"
    const h1Match = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (h1Match && titleTag) {
      const title = decodeHtmlEntities(h1Match[1].trim());
      const atCompany = titleTag[1].match(/\bat\s+(.+?)(?:\s*[\|\-]|$)/i);
      const company = atCompany ? decodeHtmlEntities(atCompany[1].trim()) : 'Unknown';
      if (title.length >= 2) {
        return {
          title,
          company,
          companyOneLiner: null,
          location: null,
          salary: null,
          description: '',
          requirements: [],
          postedDate: null,
          deadline: null,
          employmentType: null,
          remoteType: null,
          seniority: null,
          applyUrl: pageUrl,
          department: null,
        };
      }
    }
    // Fallback: h1 only + company from Greenhouse path (e.g. /coderoad/jobs/123 -> CodeRoad)
    if (h1Match) {
      const title = decodeHtmlEntities(h1Match[1].trim());
      if (title.length >= 2 && !/not found|404|error/i.test(title)) {
        try {
          const path = new URL(pageUrl).pathname.replace(/\/$/, '');
          const segments = path.split('/').filter(Boolean);
          const slug = segments[0]; // "coderoad"
          if (slug && slug !== 'jobs') {
            const company = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return {
              title,
              company,
              companyOneLiner: null,
              location: null,
              salary: null,
              description: '',
              requirements: [],
              postedDate: null,
              deadline: null,
              employmentType: null,
              remoteType: null,
              seniority: null,
              applyUrl: pageUrl,
              department: null,
            };
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // Lever: jobs.lever.co — og:title "Job Title at Company", or <title> "Company - Title", or <h1> + company from URL slug
  if (urlLower.includes('jobs.lever.co')) {
    const raw =
      html
        .match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
        ?.trim() ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      '';
    if (raw) {
      const atIdx = raw.toLowerCase().indexOf(' at ');
      const dashIdx = raw.indexOf(' - ');
      let title: string;
      let company: string;
      if (atIdx > 0) {
        title = decodeHtmlEntities(raw.slice(0, atIdx).trim());
        company = decodeHtmlEntities(raw.slice(atIdx + 4).trim());
      } else if (dashIdx > 0) {
        company = decodeHtmlEntities(raw.slice(0, dashIdx).trim());
        title = decodeHtmlEntities(raw.slice(dashIdx + 3).trim());
      } else {
        title = decodeHtmlEntities(raw.trim());
        company = companyFromUrlSlug(pageUrl) || 'Unknown';
      }
      if (title.length >= 2 && !/not found|404|error/i.test(title)) {
        return {
          title,
          company: company !== 'Unknown' ? company : companyFromUrlSlug(pageUrl) || company,
          companyOneLiner: null,
          location: null,
          salary: null,
          description: '',
          requirements: [],
          postedDate: null,
          deadline: null,
          employmentType: null,
          remoteType: null,
          seniority: null,
          applyUrl: pageUrl,
          department: null,
        };
      }
    }
    const h1Match = html.match(/<h1[^>]*>([^<]{2,200})<\/h1>/i);
    if (h1Match) {
      const title = decodeHtmlEntities(h1Match[1].trim());
      if (title.length >= 2 && !/not found|404|error/i.test(title)) {
        const company = companyFromUrlSlug(pageUrl);
        if (company) {
          return {
            title,
            company,
            companyOneLiner: null,
            location: null,
            salary: null,
            description: '',
            requirements: [],
            postedDate: null,
            deadline: null,
            employmentType: null,
            remoteType: null,
            seniority: null,
            applyUrl: pageUrl,
            department: null,
          };
        }
      }
    }
  }

  // Workable: apply.workable.com
  if (urlLower.includes('apply.workable.com')) {
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const raw = (ogTitle?.[1] || titleTag?.[1] || '').trim();
    if (raw) {
      const atIdx = raw.toLowerCase().indexOf(' at ');
      const title =
        atIdx > 0
          ? decodeHtmlEntities(raw.slice(0, atIdx).trim())
          : decodeHtmlEntities(raw.replace(/\s*[\|\-].*$/, '').trim());
      const company = atIdx > 0 ? decodeHtmlEntities(raw.slice(atIdx + 4).trim()) : 'Unknown';
      if (title.length >= 2) {
        return {
          title,
          company,
          companyOneLiner: null,
          location: null,
          salary: null,
          description: '',
          requirements: [],
          postedDate: null,
          deadline: null,
          employmentType: null,
          remoteType: null,
          seniority: null,
          applyUrl: pageUrl,
          department: null,
        };
      }
    }
  }

  // Apple: jobs.apple.com — title/og:title often "Title - Team | Apple" or "Title | Apple Careers"
  if (urlLower.includes('jobs.apple.com')) {
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const raw = (ogTitle?.[1] || titleTag?.[1] || '').trim();
    if (raw) {
      const pipeIdx = raw.indexOf('|');
      const dashIdx = raw.indexOf(' - ');
      let title = raw;
      if (pipeIdx > 0) {
        title = raw.slice(0, pipeIdx).trim();
        // "Senior Software Engineer - Streaming Media | Apple" -> title left of |, company Apple
      } else if (dashIdx > 0) {
        title = raw.slice(0, dashIdx).trim();
      }
      title = decodeHtmlEntities(title);
      const company = pipeIdx > 0 ? decodeHtmlEntities(raw.slice(pipeIdx + 1).trim()) : 'Apple';
      if (title.length >= 2 && !/not found|404|error|careers/i.test(title)) {
        return {
          title,
          company: company.length >= 2 ? company : 'Apple',
          companyOneLiner: null,
          location: null,
          salary: null,
          description: '',
          requirements: [],
          postedDate: null,
          deadline: null,
          employmentType: null,
          remoteType: null,
          seniority: null,
          applyUrl: pageUrl,
          department: null,
        };
      }
    }
    // Fallback: derive title from URL slug (e.g. .../details/200648365-0836/senior-software-engineer-streaming-media?team=SFTWR)
    try {
      const path = new URL(pageUrl).pathname.replace(/\/$/, '');
      const segments = path.split('/').filter(Boolean);
      const slug = segments[segments.length - 1];
      if (slug && slug.length >= 5 && !/^\d+-\d+$/.test(slug)) {
        const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (title.length >= 5) {
          return {
            title,
            company: 'Apple',
            companyOneLiner: null,
            location: null,
            salary: null,
            description: '',
            requirements: [],
            postedDate: null,
            deadline: null,
            employmentType: null,
            remoteType: null,
            seniority: null,
            applyUrl: pageUrl,
            department: null,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function withCompanyFromUrlIfUnknown(detail: JobDetail, pageUrl: string): JobDetail {
  if (detail.company === 'Unknown' || !detail.company.trim()) {
    const fromUrl = companyFromUrlSlug(pageUrl);
    if (fromUrl) return { ...detail, company: fromUrl };
  }
  return detail;
}

/**
 * Extract a single job detail from HTML. JSON-LD first, then microdata, then DOM fallback, then LLM.
 */
export async function extractJobDetail(
  html: string,
  pageUrl: string,
  options?: { allowLlmFallback?: boolean },
): Promise<JobDetail> {
  let jsonLd = tryJsonLd(html, pageUrl);
  if (jsonLd && jsonLd.title !== 'Untitled') return withCompanyFromUrlIfUnknown(jsonLd, pageUrl);
  const micro = tryMicrodata(html, pageUrl);
  if (micro && micro.title !== 'Untitled') return withCompanyFromUrlIfUnknown(micro, pageUrl);
  const dom = tryDomFallback(html, pageUrl);
  if (dom && dom.title !== 'Untitled') return withCompanyFromUrlIfUnknown(dom, pageUrl);
  if (options?.allowLlmFallback === false) {
    return {
      title: 'Untitled',
      company: 'Unknown',
      companyOneLiner: null,
      location: null,
      salary: null,
      description: '',
      requirements: [],
      postedDate: null,
      deadline: null,
      employmentType: null,
      remoteType: null,
      seniority: null,
      applyUrl: pageUrl,
      department: null,
    };
  }
  return extractWithLlm(html, pageUrl);
}
