import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAnalysisById } from '@careersignal/db';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { getDraftText, generateCoverLetterPdfBuffer } from '@/lib/cover-letter-pdf';

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
    const safeId = analysisId.slice(0, 8);

    if (format === 'docx') {
      if (!draftText || !draftText.trim()) {
        return NextResponse.json({ error: 'Cover letter draft not found' }, { status: 404 });
      }
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

    // PDF (shared helper)
    const pdfBuffer = await generateCoverLetterPdfBuffer(
      analysis.coverLetters as Record<string, string> | null,
    );
    if (!pdfBuffer) {
      return NextResponse.json({ error: 'Cover letter draft not found' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(pdfBuffer), {
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
