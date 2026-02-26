/**
 * Company Research Agent — Summarizes company culture, norms, and context
 * from HTML of an about/careers page. Used by Application Assistant to
 * tailor cover letters and interview prep.
 */

import { complete } from '@careersignal/llm';

export interface CompanyResearchResult {
  summary: string;
  culture: string;
  norms: string;
}

/**
 * Summarize company from about/careers page HTML.
 */
export async function researchCompanyFromHtml(
  companyName: string,
  html: string,
  pageUrl: string,
): Promise<CompanyResearchResult> {
  const bodyStart = html.indexOf('<body');
  const bodyContent = bodyStart > 0 ? html.substring(bodyStart) : html;
  const truncated = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 25000);

  const prompt = `You are a career advisor. Summarize this company based on the following web page content.

Company name: ${companyName}
Page URL: ${pageUrl}

From the HTML content below, extract and return a JSON object with:
- "summary": 2-3 sentence overview of what the company does and its mission.
- "culture": 2-4 sentences on company culture, values, and work environment (e.g. collaboration, innovation, diversity).
- "norms": 2-3 sentences on hiring/application norms, what they value in candidates, or how they describe their team.

If the content does not contain enough information, use general professional phrasing for that field. Return only the JSON object.

Content:
${truncated}`;

  try {
    const response = await complete(prompt, 'GENERAL', {
      format: 'json',
      temperature: 0.2,
      maxTokens: 1024,
      timeout: 60000,
    });
    const parsed = JSON.parse(response);
    return {
      summary: parsed.summary || '',
      culture: parsed.culture || '',
      norms: parsed.norms || '',
    };
  } catch {
    return {
      summary: '',
      culture: '',
      norms: '',
    };
  }
}
