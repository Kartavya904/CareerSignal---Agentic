/**
 * PDF text extraction using pdf-parse.
 * Code-only step - no LLM involvement.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// pdf-parse has issues with ESM, so we use dynamic import
type PdfParseResult = {
  text: string;
  numpages: number;
  info?: { Title?: string; Author?: string; Creator?: string };
};
type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

let pdfParse: PdfParseFn | null = null;

async function getPdfParser(): Promise<PdfParseFn> {
  if (!pdfParse) {
    const mod = await import('pdf-parse');
    pdfParse = (mod.default ?? mod) as PdfParseFn;
  }
  return pdfParse;
}

export interface ExtractedText {
  text: string;
  numPages: number;
  info?: {
    title?: string;
    author?: string;
    creator?: string;
  };
}

/**
 * Extract text content from a PDF file.
 */
export async function extractTextFromPdf(filePath: string): Promise<ExtractedText> {
  const absolutePath = path.resolve(filePath);

  // Verify file exists
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Resume file not found: ${absolutePath}`);
  }

  // Read file
  const buffer = await fs.readFile(absolutePath);

  // Parse PDF
  const parser = await getPdfParser();
  const data = await parser(buffer);

  return {
    text: data.text,
    numPages: data.numpages,
    info: data.info
      ? {
          title: data.info.Title,
          author: data.info.Author,
          creator: data.info.Creator,
        }
      : undefined,
  };
}

/**
 * Extract text from DOCX file (basic implementation).
 * For V1, we focus on PDF - DOCX can be added later.
 */
export async function extractTextFromDocx(_filePath: string): Promise<ExtractedText> {
  throw new Error('DOCX parsing not yet implemented - please use PDF format');
}

/**
 * Extract text from a resume file based on extension.
 */
export async function extractText(filePath: string): Promise<ExtractedText> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return extractTextFromPdf(filePath);
    case '.docx':
    case '.doc':
      return extractTextFromDocx(filePath);
    case '.txt':
      const text = await fs.readFile(filePath, 'utf-8');
      return { text, numPages: 1 };
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}
