import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { getDb, getAnalysisById, getUserById } from '@careersignal/db';
import { getDraftText, generateCoverLetterPdfBuffer, getDynamicCoverLetterName } from '@/lib/cover-letter-pdf';
import { generateCoverLetterDocxBuffer } from '@/lib/cover-letter-docx';

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
    
    // Fetch user to get their first name for the filename
    const user = await getUserById(db, userId);
    
    const companyName = (analysis.jobSummary as { company?: string })?.company;

    if (format === 'docx') {
      const docxBuffer = await generateCoverLetterDocxBuffer(
        analysis.coverLetters as Record<string, string> | null,
      );
      if (!docxBuffer) {
        return NextResponse.json({ error: 'Cover letter draft not found' }, { status: 404 });
      }
      return new NextResponse(new Uint8Array(docxBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${getDynamicCoverLetterName(user?.name, companyName, 'docx')}"`,
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
        'Content-Disposition': `attachment; filename="${getDynamicCoverLetterName(user?.name, companyName, 'pdf')}"`,
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
