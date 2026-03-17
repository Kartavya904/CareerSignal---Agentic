import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { getDraftText } from './cover-letter-pdf';

const COVER_LETTER_DOCX_FILENAME = 'cover-letter.docx';

/**
 * Build Word document (DOCX) buffer from cover letter draft text. Returns null if no draft text.
 */
export async function generateCoverLetterDocxBuffer(
  coverLetters: Record<string, string> | null | undefined,
): Promise<Buffer | null> {
  const draftText = getDraftText(coverLetters);
  if (!draftText || !draftText.trim()) return null;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: draftText.split(/\r?\n/).map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line })],
            }),
        ),
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

/**
 * Write cover letter DOCX to the application assistant run folder and return the file path.
 * Used by the email agent to attach the same artifact that is saved with the run.
 * Returns the absolute path to the written file, or null if no draft text.
 */
export async function writeCoverLetterDocxToRunFolder(
  coverLetters: Record<string, string> | null | undefined,
  runFolderPath: string,
): Promise<string | null> {
  const buffer = await generateCoverLetterDocxBuffer(coverLetters);
  if (!buffer) return null;

  if (!existsSync(runFolderPath)) {
    await mkdir(runFolderPath, { recursive: true });
  }
  const filePath = path.join(runFolderPath, COVER_LETTER_DOCX_FILENAME);
  await writeFile(filePath, buffer);
  return filePath;
}
