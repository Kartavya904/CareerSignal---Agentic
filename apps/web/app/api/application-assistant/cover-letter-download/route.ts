import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAnalysisById } from '@careersignal/db';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function getDraftText(coverLetters: Record<string, string> | null | undefined): string | null {
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
  opts: { maxWidth: number; font: any; fontSize: number },
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

export async function GET(req: Request) {
  try {
    const userId = await getRequiredUserId();
    const { searchParams } = new URL(req.url);
    const analysisId = (searchParams.get('analysisId') ?? '').trim();
    const format = (searchParams.get('format') ?? '').trim().toLowerCase();

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId is required' }, { status: 400 });
    }
    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json({ error: 'format must be pdf or docx' }, { status: 400 });
    }

    const db = getDb();
    const analysis = await getAnalysisById(db, analysisId);
    if (!analysis || analysis.userId !== userId) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const draftText = getDraftText(analysis.coverLetters as Record<string, string> | null);
    if (!draftText || !draftText.trim()) {
      return NextResponse.json({ error: 'Cover letter draft not found' }, { status: 404 });
    }

    const safeId = analysisId.slice(0, 8);
    if (format === 'docx') {
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
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="cover-letter-${safeId}.docx"`,
        },
      });
    }

    // PDF
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
    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cover-letter-${safeId}.pdf"`,
      },
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to download cover letter' },
      { status: 500 },
    );
  }
}
