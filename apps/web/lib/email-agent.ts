/**
 * Email agent: send application analysis summary to the user who ran the analysis.
 * Uses a single shared Outlook (SMTP from env). PDF cover letter is written to the
 * run folder and attached. No separate process — runs in the same Next.js app when
 * the pipeline finishes.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Db } from '@careersignal/db';
import { getUserById } from '@careersignal/db';
import { getDynamicCoverLetterName, writeCoverLetterPdfToRunFolder } from '@/lib/cover-letter-pdf';
import { unlink } from 'fs/promises';

const MAX_SUBJECT_TITLE_LENGTH = 50;
const SUBJECT_SUFFIX = ' - CareerSignal';

export interface SendAnalysisSummaryEmailInput {
  db: Db;
  userId: string;
  analysisId: string;
  jobTitle: string;
  company: string;
  location: string | null;
  applyUrl: string | null;
  /** Company homepage / main URL. If set, company name on next line links here. */
  companyUrl?: string | null;
  /** Careers page URL. Shown pipe-separated after company line when present. */
  careersUrl?: string | null;
  /** Company LinkedIn URL. Shown pipe-separated after company line when present. */
  linkedInUrl?: string | null;
  matchScore: number | null;
  matchGrade: string | null;
  matchRationale: string | null;
  strengths: string[];
  gaps: string[];
  coverLetters: Record<string, string> | null;
  rankedContacts: unknown[];
  bestContactDraft: { subject?: string; body: string } | null;
  runFolderPath: string;
  emailUpdatesEnabled: boolean;
  emailMinMatchScore: number | null;
  baseUrl: string;
  docxPath?: string | null;
  htmlPath?: string | null;
}

export interface SendAnalysisSummaryEmailResult {
  sent: boolean;
  reason?: string;
}

function cleanTitleForSubject(title: string): string {
  const t = title.trim();
  if (t.length <= MAX_SUBJECT_TITLE_LENGTH) return t;
  return t.slice(0, MAX_SUBJECT_TITLE_LENGTH - 3).trim() + '...';
}

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const portNum = port ? parseInt(port, 10) : 587;
  return nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    auth: { user, pass },
  });
}

function contactLink(c: unknown): string {
  const r = c as Record<string, unknown>;
  const name = (r.name as string) ?? 'Contact';
  const linkedinUrl = r.linkedinUrl as string | undefined;
  const email = r.email as string | undefined;
  const evidenceUrl = (r.evidenceUrls as string[] | undefined)?.[0];
  if (linkedinUrl) return `${name}: ${linkedinUrl}`;
  if (email) return `${name}: mailto:${email}`;
  if (evidenceUrl) return `${name}: ${evidenceUrl}`;
  return name;
}

/**
 * Send analysis summary email to the user. Returns { sent: true } or { sent: false, reason }.
 * Does not throw; logs internally only via returned reason.
 */
export async function sendAnalysisSummaryEmail(
  input: SendAnalysisSummaryEmailInput,
): Promise<SendAnalysisSummaryEmailResult> {
  const {
    db,
    userId,
    analysisId,
    jobTitle,
    company,
    location,
    applyUrl,
    companyUrl,
    careersUrl,
    linkedInUrl,
    matchScore,
    matchGrade,
    matchRationale,
    strengths,
    gaps,
    coverLetters,
    rankedContacts,
    bestContactDraft,
    runFolderPath,
    emailUpdatesEnabled,
    emailMinMatchScore,
    baseUrl,
    docxPath,
    htmlPath,
  } = input;

  if (!emailUpdatesEnabled) {
    return { sent: false, reason: 'Email updates disabled' };
  }

  const user = await getUserById(db, userId);
  if (!user?.email?.trim()) {
    return { sent: false, reason: 'User has no email' };
  }
  const toEmail = user.email.trim();

  const minScore = emailMinMatchScore ?? 0;
  const score = matchScore ?? 0;
  if (score < minScore) {
    return { sent: false, reason: `Match score ${score} below minimum ${minScore}` };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return {
      sent: false,
      reason: 'SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local)',
    };
  }

  const locationPart = location?.trim() ? ` (${location.trim()})` : '';
  const analysisLink = `${baseUrl.replace(/\/$/, '')}/application-assistant/${analysisId}`;
  const applyLink = applyUrl?.trim() || analysisLink;

  const companyUrlTrim = companyUrl?.trim();
  const careersUrlTrim = careersUrl?.trim();
  const linkedInUrlTrim = linkedInUrl?.trim();
  const companyLineParts: string[] = [];
  if (companyUrlTrim) {
    companyLineParts.push(`${company}: ${companyUrlTrim}`);
  } else {
    companyLineParts.push(company);
  }
  if (careersUrlTrim) companyLineParts.push(`Careers: ${careersUrlTrim}`);
  if (linkedInUrlTrim) companyLineParts.push(`LinkedIn: ${linkedInUrlTrim}`);
  const companyLine = companyLineParts.join(' | ');

  const subject = `Apply for ${cleanTitleForSubject(jobTitle)} at ${company}${SUBJECT_SUFFIX}`;

  const strengthsText = strengths.length > 0 ? strengths.join(' ') : 'See analysis for details.';
  const gapsText = gaps.length > 0 ? gaps.join(' ') : 'None highlighted.';
  const rationaleLine = matchRationale?.trim() || `Score ${score}/100 (${matchGrade ?? 'N/A'}).`;
  const gradeDisplay = matchGrade?.trim() || 'N/A';

  const contactsList =
    rankedContacts.length > 0
      ? rankedContacts.map((c) => contactLink(c)).join('\n')
      : 'No contacts discovered for this run.';

  // Collapse excessive newlines in embedded draft so email isn't overly spaced
  const normalizedDraftBody = bestContactDraft?.body?.replace(/\n{3,}/g, '\n\n') ?? '';

  // Plain-text fallback
  const bodyText = [
    `Our analysis for ${jobTitle} at ${company}${locationPart}.`,
    `Apply now: ${applyLink}`,
    companyLine,
    '',
    `This role has been ranked for you. You scored ${score} out of 100 (${gradeDisplay}). Here is a brief overview.`,
    '',
    `Score and match: ${rationaleLine}`,
    '',
    `What matches: ${strengthsText}`,
    '',
    `What to improve: ${gapsText}`,
    '',
    'Download the attached cover letter (PDF) to apply to this job.',
    '',
    'Best people to reach out to:',
    contactsList,
    normalizedDraftBody
      ? [
          '',
          'A draft of the message you should send:',
          bestContactDraft?.subject ? `Subject: ${bestContactDraft.subject}` : '',
          normalizedDraftBody,
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    '',
    `View full analysis: ${analysisLink}`,
  ]
    .filter(Boolean)
    .join('\n');

  // HTML version with bold labels and key terms
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>\n');
  const contactsListHtml =
    rankedContacts.length > 0
      ? rankedContacts.map((c) => escapeHtml(contactLink(c))).join('<br>\n')
      : 'No contacts discovered for this run.';
  const hrefEsc = (u: string) =>
    u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const companyHtml = companyUrlTrim
    ? `<a href="${hrefEsc(companyUrlTrim)}">${escapeHtml(company)}</a>`
    : escapeHtml(company);
  const careersPart = careersUrlTrim && ` | <a href="${hrefEsc(careersUrlTrim)}">Careers</a>`;
  const linkedInPart = linkedInUrlTrim && ` | <a href="${hrefEsc(linkedInUrlTrim)}">LinkedIn</a>`;
  const companyLineHtml = `<p>${companyHtml}${careersPart ?? ''}${linkedInPart ?? ''}</p>`;
  const bodyHtml = `
<p>Our analysis for <strong>${escapeHtml(jobTitle)}</strong> at <strong>${escapeHtml(company)}</strong>${locationPart ? ` (<strong>${escapeHtml(location!.trim())}</strong>)` : ''}.</p>
<p><a href="${applyLink}">Apply now</a></p>
${companyLineHtml}
<p>This role has been ranked for you. You scored <strong>${score}</strong> out of 100 (<strong>${escapeHtml(gradeDisplay)}</strong>). Here is a brief overview.</p>
<p><strong>Score and match:</strong> ${escapeHtml(rationaleLine)}</p>
<p><strong>What matches:</strong> ${escapeHtml(strengthsText)}</p>
<p><strong>What to improve:</strong> ${escapeHtml(gapsText)}</p>
<p>Download the attached cover letter (PDF) to apply to this job.</p>
<p><strong>Best people to reach out to:</strong><br>\n${contactsListHtml}</p>
${normalizedDraftBody ? `<p><strong>A draft of the message you should send:</strong></p>${bestContactDraft?.subject ? `<p><strong>Subject:</strong> ${escapeHtml(bestContactDraft.subject)}</p>` : ''}<p>${escapeHtml(normalizedDraftBody).replace(/\n/g, '<br>\n')}</p>` : ''}
<p><a href="${analysisLink}">View full analysis</a></p>
`.trim();

  let pdfPath: string | null = null;
  try {
    pdfPath = await writeCoverLetterPdfToRunFolder(coverLetters, runFolderPath);
  } catch (e) {
    return {
      sent: false,
      reason: `Failed to write cover letter PDF: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const attachments: { filename: string; content?: Buffer; path?: string }[] = [];
  if (pdfPath) {
    attachments.push({ filename: getDynamicCoverLetterName(user.name, company, 'pdf'), path: pdfPath });
  }
  if (docxPath) {
    attachments.push({ filename: getDynamicCoverLetterName(user.name, company, 'docx'), path: docxPath });
  }
  if (htmlPath) {
    attachments.push({ filename: 'analysis-summary.html', path: htmlPath });
  }

  try {
    const from = process.env.SMTP_USER ?? 'CareerSignal';
    await transporter.sendMail({
      from: `"CareerSignal" <${from}>`,
      to: toEmail,
      subject,
      text: bodyText,
      html: bodyHtml,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    const unlinkPromises = [];
    if (pdfPath) unlinkPromises.push(unlink(pdfPath).catch(() => {}));
    if (docxPath) unlinkPromises.push(unlink(docxPath).catch(() => {}));
    if (htmlPath) unlinkPromises.push(unlink(htmlPath).catch(() => {}));
    await Promise.all(unlinkPromises);

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: `SMTP send failed: ${message}` };
  }
}
