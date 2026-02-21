import {
  getDb,
  getUserById,
  upsertProfile,
  getProfileByUserId,
  updateUserMetadata,
} from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { getUserDataDir, getResumeFullPath } from '@/lib/user-data';
import { extractText, extractBasicInfo } from '@careersignal/agents';
import { createJob, pushEntry, markDone } from '@/lib/parse-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function log(userId: string, type: string, message: string) {
  pushEntry(userId, 'log', { type, message });
}

function step(userId: string, s: number, total: number, name: string) {
  pushEntry(userId, 'step', { step: s, total, name });
}

async function runParsing(userId: string) {
  try {
    log(userId, 'info', 'Authenticating user...');
    const db = getDb();
    const user = await getUserById(db, userId);

    if (!user?.email) {
      pushEntry(userId, 'error', { message: 'User email not found' });
      markDone(userId);
      return;
    }

    log(userId, 'success', `Authenticated as ${user.email}`);
    log(userId, 'info', 'Locating resume file...');

    const userDir = await getUserDataDir(user.email);
    const resumePath = getResumeFullPath(userDir);

    if (!resumePath) {
      pushEntry(userId, 'error', { message: 'No resume file found' });
      markDone(userId);
      return;
    }

    log(userId, 'success', `Found resume at ${resumePath.split(/[/\\]/).pop()}`);

    log(userId, 'info', 'Extracting text from PDF...');
    step(userId, 1, 4, 'PDF Text Extraction');

    const extracted = await extractText(resumePath);
    log(
      userId,
      'success',
      `Extracted ${extracted.text.length} characters from ${extracted.numPages} page(s)`,
    );

    log(userId, 'info', 'Parsing basic information (name, email, phone, location)...');
    step(userId, 2, 4, 'Basic Info Extraction');

    const basicInfo = extractBasicInfo(extracted.text);
    log(userId, 'success', `Found: ${basicInfo.name}`);
    if (basicInfo.email) log(userId, 'detail', `  Email: ${basicInfo.email}`);
    if (basicInfo.phone) log(userId, 'detail', `  Phone: ${basicInfo.phone}`);
    if (basicInfo.location) log(userId, 'detail', `  Location: ${basicInfo.location}`);
    if (basicInfo.linkedinUrl) log(userId, 'detail', `  LinkedIn: ${basicInfo.linkedinUrl}`);
    if (basicInfo.githubUrl) log(userId, 'detail', `  GitHub: ${basicInfo.githubUrl}`);

    log(userId, 'info', 'Starting multi-step AI extraction...');
    step(userId, 3, 4, 'AI Section Extraction');
    log(userId, 'thinking', 'Using Planner + Extractor approach for reliability');

    const { extractSections, normalizeSkills } = await import('@careersignal/agents');

    const sections = await extractSections(extracted.text, (progress) => {
      const statusEmoji =
        progress.status === 'done' ? '✓' : progress.status === 'running' ? '◐' : '›';
      const type =
        progress.status === 'done' ? 'success' : progress.status === 'error' ? 'error' : 'thinking';
      log(userId, type, `${statusEmoji} [${progress.step}] ${progress.message || progress.status}`);
    });

    const normalizedSkills = normalizeSkills(sections.skills);

    const extractionSuccessful =
      sections.education.length > 0 ||
      sections.experience.length > 0 ||
      sections.projects.length > 0 ||
      normalizedSkills.all.length > 0;

    if (!extractionSuccessful) {
      log(userId, 'error', 'LLM extraction returned empty results. Keeping existing data.');
      log(userId, 'info', 'This may be due to LLM timeout. Try re-parsing.');
      pushEntry(userId, 'error', { message: 'Extraction failed - LLM returned empty results' });
      markDone(userId);
      return;
    }

    log(userId, 'success', `Extracted ${sections.education.length} education entries`);
    log(userId, 'success', `Extracted ${sections.experience.length} work experiences`);
    log(userId, 'success', `Extracted ${sections.projects.length} projects`);
    log(userId, 'success', `Found ${normalizedSkills.all.length} skills`);

    const totalExpBullets = sections.experience.reduce(
      (sum, exp) => sum + (exp.bullets?.length || 0),
      0,
    );
    const totalProjBullets = sections.projects.reduce(
      (sum, proj) => sum + (proj.bullets?.length || 0),
      0,
    );
    log(userId, 'detail', `  Total experience bullets: ${totalExpBullets}`);
    log(userId, 'detail', `  Total project bullets: ${totalProjBullets}`);

    log(userId, 'info', 'Saving parsed data to database...');
    step(userId, 4, 4, 'Saving to Database');

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

    log(userId, 'success', 'Profile updated successfully!');
    pushEntry(userId, 'complete', {
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
    log(userId, 'error', `Error: ${errorMessage}`);
    pushEntry(userId, 'error', { message: errorMessage });
  } finally {
    markDone(userId);
  }
}

export async function POST() {
  try {
    const userId = await getRequiredUserId();
    console.log('[ParseStart] Creating job for user:', userId);
    createJob(userId);
    runParsing(userId).catch((err) => {
      console.error('[ParseStart] runParsing crashed:', err);
    });
    return Response.json({ started: true });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
