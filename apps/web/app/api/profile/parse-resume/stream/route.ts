import {
  getDb,
  getUserById,
  upsertProfile,
  getProfileByUserId,
  updateUserMetadata,
} from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { getUserDataDir, getResumeFullPath } from '@/lib/user-data';
import { extractText } from '@careersignal/agents';
import { extractBasicInfo } from '@careersignal/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function createSSEMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = async (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(createSSEMessage(event, data)));
          await new Promise<void>((r) => setImmediate(r));
          await new Promise<void>((r) => setTimeout(r, 10));
        } catch {
          closed = true;
        }
      };

      try {
        await send('log', { type: 'info', message: 'Authenticating user...' });
        const userId = await getRequiredUserId();
        const db = getDb();
        const user = await getUserById(db, userId);

        if (!user?.email) {
          await send('error', { message: 'User email not found' });
          closed = true;
          controller.close();
          return;
        }

        await send('log', { type: 'success', message: `Authenticated as ${user.email}` });

        await send('log', { type: 'info', message: 'Locating resume file...' });
        const userDir = await getUserDataDir(user.email);
        const resumePath = getResumeFullPath(userDir);

        if (!resumePath) {
          await send('error', { message: 'No resume file found' });
          closed = true;
          controller.close();
          return;
        }

        await send('log', {
          type: 'success',
          message: `Found resume at ${resumePath.split(/[/\\]/).pop()}`,
        });

        await send('log', { type: 'info', message: 'Extracting text from PDF...' });
        await send('step', { step: 1, total: 4, name: 'PDF Text Extraction' });

        const extracted = await extractText(resumePath);
        await send('log', {
          type: 'success',
          message: `Extracted ${extracted.text.length} characters from ${extracted.numPages} page(s)`,
        });

        await send('log', {
          type: 'info',
          message: 'Parsing basic information (name, email, phone, location)...',
        });
        await send('step', { step: 2, total: 4, name: 'Basic Info Extraction' });

        const basicInfo = extractBasicInfo(extracted.text);
        await send('log', { type: 'success', message: `Found: ${basicInfo.name}` });
        if (basicInfo.email)
          await send('log', { type: 'detail', message: `  Email: ${basicInfo.email}` });
        if (basicInfo.phone)
          await send('log', { type: 'detail', message: `  Phone: ${basicInfo.phone}` });
        if (basicInfo.location)
          await send('log', { type: 'detail', message: `  Location: ${basicInfo.location}` });
        if (basicInfo.linkedinUrl)
          await send('log', { type: 'detail', message: `  LinkedIn: ${basicInfo.linkedinUrl}` });
        if (basicInfo.githubUrl)
          await send('log', { type: 'detail', message: `  GitHub: ${basicInfo.githubUrl}` });

        await send('log', { type: 'info', message: 'Starting multi-step AI extraction...' });
        await send('step', { step: 3, total: 4, name: 'AI Section Extraction' });
        await send('log', {
          type: 'thinking',
          message: 'Using Planner + Extractor approach for reliability',
        });

        const { extractSections, normalizeSkills } = await import('@careersignal/agents');

        const sections = await extractSections(extracted.text, (progress) => {
          const statusEmoji =
            progress.status === 'done' ? '✓' : progress.status === 'running' ? '◐' : '›';
          const type =
            progress.status === 'done'
              ? 'success'
              : progress.status === 'error'
                ? 'error'
                : 'thinking';
          void send('log', {
            type,
            message: `${statusEmoji} [${progress.step}] ${progress.message || progress.status}`,
          });
        });

        const normalizedSkills = normalizeSkills(sections.skills);

        const extractionSuccessful =
          sections.education.length > 0 ||
          sections.experience.length > 0 ||
          sections.projects.length > 0 ||
          normalizedSkills.all.length > 0;

        if (!extractionSuccessful) {
          await send('log', {
            type: 'error',
            message: 'LLM extraction returned empty results. Keeping existing data.',
          });
          await send('log', {
            type: 'info',
            message: 'This may be due to LLM timeout. Try re-parsing.',
          });
          await send('error', { message: 'Extraction failed - LLM returned empty results' });
          closed = true;
          controller.close();
          return;
        }

        await send('log', {
          type: 'success',
          message: `Extracted ${sections.education.length} education entries`,
        });
        await send('log', {
          type: 'success',
          message: `Extracted ${sections.experience.length} work experiences`,
        });
        await send('log', {
          type: 'success',
          message: `Extracted ${sections.projects.length} projects`,
        });
        await send('log', {
          type: 'success',
          message: `Found ${normalizedSkills.all.length} skills`,
        });

        const totalExpBullets = sections.experience.reduce(
          (sum, exp) => sum + (exp.bullets?.length || 0),
          0,
        );
        const totalProjBullets = sections.projects.reduce(
          (sum, proj) => sum + (proj.bullets?.length || 0),
          0,
        );
        await send('log', {
          type: 'detail',
          message: `  Total experience bullets: ${totalExpBullets}`,
        });
        await send('log', {
          type: 'detail',
          message: `  Total project bullets: ${totalProjBullets}`,
        });

        await send('log', { type: 'info', message: 'Saving parsed data to database...' });
        await send('step', { step: 4, total: 4, name: 'Saving to Database' });

        const existingProfile = await getProfileByUserId(db, userId);

        const transformExperience = (exp: (typeof sections.experience)[number]) => ({
          company: exp.company,
          title: exp.title,
          location: exp.location,
          start_date: exp.startDate,
          end_date: exp.endDate,
          description: exp.description,
          bullets: exp.bullets,
          projects: exp.projects,
        });

        const transformEducation = (edu: (typeof sections.education)[number]) => ({
          institution: edu.institution,
          degree: edu.degree,
          field: edu.field,
          gpa: edu.gpa,
          start_date: edu.startDate,
          end_date: edu.endDate,
          coursework: edu.coursework,
          awards: edu.awards,
          leadership: edu.leadership,
        });

        const transformProject = (proj: (typeof sections.projects)[number]) => ({
          name: proj.name,
          context: proj.context,
          dates: proj.dates,
          description: proj.description,
          technologies: proj.technologies,
          bullets: proj.bullets,
          achievements: proj.achievements,
        });

        const profileData = {
          name: basicInfo.name || existingProfile?.name || 'Unknown',
          email: basicInfo.email || existingProfile?.email || null,
          phone: basicInfo.phone || existingProfile?.phone || null,
          location: basicInfo.location || existingProfile?.location || 'Unknown',
          workAuthorization: existingProfile?.workAuthorization || 'OTHER',
          linkedinUrl: basicInfo.linkedinUrl || existingProfile?.linkedinUrl || null,
          githubUrl: basicInfo.githubUrl || existingProfile?.githubUrl || null,
          portfolioUrl: basicInfo.portfolioUrl || existingProfile?.portfolioUrl || null,
          experience: sections.experience.map(transformExperience),
          education: sections.education.map(transformEducation),
          projects: sections.projects.map(transformProject),
          skills: normalizedSkills.all,
          highlightedSkills: normalizedSkills.proficient ?? [],
          certifications: sections.certifications,
          languages: sections.languages,
          resumeRawText: extracted.text,
          resumeFileRef: existingProfile?.resumeFileRef || null,
          resumeParsedAt: new Date(),
        };

        await upsertProfile(db, userId, profileData);
        await updateUserMetadata(db, userId, { resumeParsedAt: new Date() });

        await send('log', { type: 'success', message: 'Profile updated successfully!' });
        await send('complete', {
          success: true,
          summary: {
            name: basicInfo.name,
            educationCount: sections.education.length,
            experienceCount: sections.experience.length,
            projectsCount: sections.projects.length,
            skillsCount: normalizedSkills.all.length,
          },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await send('log', { type: 'error', message: `Error: ${errorMessage}` });
        await send('error', { message: errorMessage });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
