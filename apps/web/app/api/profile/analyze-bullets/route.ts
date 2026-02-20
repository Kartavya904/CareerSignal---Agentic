import { NextResponse } from 'next/server';
import { getRequiredUserId } from '@/lib/auth';
import { complete, parseJsonResponse } from '@careersignal/llm';
import { z } from 'zod';

const BulletAnalysisSchema = z.object({
  scores: z.array(
    z.object({
      bullet: z.string(),
      score: z.number().min(1).max(5),
      feedback: z.string(),
    }),
  ),
});

const EXPERIENCE_PROMPT = `You are an expert resume reviewer. Analyze each bullet point from this work experience and rate it on a scale of 1-5 based on:

1 = Weak: Vague, no metrics, doesn't show impact
2 = Below Average: Some specificity but lacks quantification
3 = Average: Clear responsibility but could be stronger
4 = Good: Shows impact with some metrics or results
5 = Excellent: Quantified results, clear impact, action-oriented

Company: {company}
Title: {title}

Bullet Points to Analyze:
{bullets}

Return JSON with this exact structure:
{
  "scores": [
    {
      "bullet": "the original bullet text",
      "score": 4,
      "feedback": "Brief 1-sentence feedback on how to improve or why it's good"
    }
  ]
}

Provide constructive feedback that helps improve each bullet.`;

const PROJECT_PROMPT = `You are an expert resume reviewer. Analyze each bullet point from this project and rate it on a scale of 1-5 based on:

1 = Weak: Vague, no clear outcome or technical depth
2 = Below Average: Some detail but lacks impact or specificity
3 = Average: Clear what was done but could be stronger
4 = Good: Shows impact, technologies, or results
5 = Excellent: Quantified results, clear impact, demonstrates skills

Project: {name}
Context: {context}

Bullet Points to Analyze:
{bullets}

Return JSON with this exact structure:
{
  "scores": [
    {
      "bullet": "the original bullet text",
      "score": 4,
      "feedback": "Brief 1-sentence feedback on how to improve or why it's good"
    }
  ]
}

Provide constructive feedback that helps improve each bullet.`;

export async function POST(request: Request) {
  try {
    await getRequiredUserId();

    const body = await request.json();
    const { type, company, title, name, context, bullets } = body;

    if (!bullets || !Array.isArray(bullets) || bullets.length === 0) {
      return NextResponse.json({ error: 'No bullets to analyze' }, { status: 400 });
    }

    const bulletsText = bullets.map((b: string, i: number) => `${i + 1}. ${b}`).join('\n');
    const prompt =
      type === 'project'
        ? PROJECT_PROMPT.replace('{name}', name || 'Unknown')
            .replace('{context}', context || '')
            .replace('{bullets}', bulletsText)
        : EXPERIENCE_PROMPT.replace('{company}', company || 'Unknown')
            .replace('{title}', title || 'Unknown')
            .replace('{bullets}', bulletsText);

    const response = await complete(prompt, 'FAST', {
      format: 'json',
      temperature: 0.2,
      timeout: 60000,
    });

    const result = parseJsonResponse(response, BulletAnalysisSchema);

    if (!result.success || !result.data) {
      console.error('Failed to parse analysis:', result.error);
      return NextResponse.json({ error: 'Failed to analyze bullets' }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Bullet analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
