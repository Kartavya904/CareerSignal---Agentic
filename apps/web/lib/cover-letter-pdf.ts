/**
 * Shared cover letter PDF generation for download API and email agent.
 * Can produce a buffer (for HTTP response) or write to a run folder (for email attachment).
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const COVER_LETTER_FILENAME = 'cover-letter.pdf';

export function getDraftText(
  coverLetters: Record<string, string> | null | undefined,
): string | null {
  if (!coverLetters) return null;
  return (
    coverLetters.draft ??
    coverLetters.formal ??
    coverLetters.conversational ??
    coverLetters.bold ??
    Object.values(coverLetters)[0] ??
    null
  );
}

function wrapTextToWidth(
  text: string,
  opts: {
    maxWidth: number;
    font: { widthOfTextAtSize: (t: string, s: number) => number };
    fontSize: number;
  },
): string[] {
  const { maxWidth, font, fontSize } = opts;
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0] ?? '';
    for (let i = 1; i < words.length; i++) {
      const w = words[i]!;
      const candidate = `${current} ${w}`;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = w;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function getDynamicCoverLetterName(userName: string | null | undefined, company: string | null | undefined, extension: 'pdf' | 'docx'): string {
  const firstName = userName ? userName.split(' ')[0] : 'Applicant';
  const cleanFirstName = firstName?.replace(/[^a-zA-Z0-9]/g, '') || 'Applicant';
  
  const companyStr = company?.replace(/[^a-zA-Z0-9\s]/g, '') || 'Company';
  const companyWords = companyStr.split(/\s+/).filter(Boolean);
  
  const capitalizedCompanyWords = companyWords.map(
    w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
  
  return `${cleanFirstName}_Cover_Letter_${capitalizedCompanyWords.join('_')}.${extension}`;
}

/**
 * Build PDF bytes from cover letter draft text. Returns null if no draft text.
 */
export async function generateCoverLetterPdfBuffer(
  coverLetters: Record<string, string> | null | undefined,
): Promise<Buffer | null> {
  const draftText = getDraftText(coverLetters);
  if (!draftText?.trim()) return null;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontSize = 11;
  const lineHeight = 14;
  const margin = 54;

  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const maxWidth = width - margin * 2;
  let y = height - margin;

  const lines = wrapTextToWidth(draftText, { maxWidth, font, fontSize });
  for (const line of lines) {
    if (y < margin + lineHeight) {
      page = pdfDoc.addPage();
      y = page.getSize().height - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Write cover letter PDF to the application assistant run folder and return the file path.
 * Used by the email agent to attach the same artifact that is saved with the run.
 * Returns the absolute path to the written file, or null if no draft text.
 */
export async function writeCoverLetterPdfToRunFolder(
  coverLetters: Record<string, string> | null | undefined,
  runFolderPath: string,
): Promise<string | null> {
  const buffer = await generateCoverLetterPdfBuffer(coverLetters);
  if (!buffer) return null;

  if (!existsSync(runFolderPath)) {
    await mkdir(runFolderPath, { recursive: true });
  }
  const filePath = path.join(runFolderPath, COVER_LETTER_FILENAME);
  await writeFile(filePath, buffer);
  return filePath;
}
