import { NextResponse } from 'next/server';
import { getDb, getUserById, upsertProfile, getProfileByUserId } from '@careersignal/db';
import { getRequiredUserId } from '@/lib/auth';
import { getUserDataDir, getResumeFullPath } from '@/lib/user-data';
import { resumeParserAgent, type ParsedResume } from '@careersignal/agents';

export async function POST() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const user = await getUserById(db, userId);

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const userDir = await getUserDataDir(user.email);
    const resumePath = getResumeFullPath(userDir);

    if (!resumePath) {
      return NextResponse.json({ error: 'No resume file found' }, { status: 404 });
    }

    // Run the Resume Parser Agent
    const result = await resumeParserAgent.execute({ filePath: resumePath });

    if (!result.success || !result.data) {
      console.error('Resume parsing failed:', result.error);
      return NextResponse.json(
        { error: result.error ?? 'Failed to parse resume' },
        { status: 500 },
      );
    }

    const parsed: ParsedResume = result.data;

    // Get existing profile to merge with parsed data
    const existingProfile = await getProfileByUserId(db, userId);

    // Transform camelCase to snake_case for date fields
    const transformedExperience = parsed.experience.map((exp) => ({
      company: exp.company,
      title: exp.title,
      location: exp.location,
      start_date: exp.startDate,
      end_date: exp.endDate,
      description: exp.description,
      bullets: exp.bullets,
      projects: exp.projects,
    }));

    const transformedEducation = parsed.education.map((edu) => ({
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field,
      gpa: edu.gpa,
      start_date: edu.startDate,
      end_date: edu.endDate,
      coursework: edu.coursework,
      awards: edu.awards,
      leadership: edu.leadership,
    }));

    const transformedProjects = parsed.projects.map((proj) => ({
      name: proj.name,
      context: proj.context,
      dates: proj.dates,
      description: proj.description,
      technologies: proj.technologies,
      bullets: proj.bullets,
      achievements: proj.achievements,
    }));

    // Build the profile update data
    const profileData = {
      name: parsed.basicInfo.name || existingProfile?.name || 'Unknown',
      email: parsed.basicInfo.email || existingProfile?.email || null,
      phone: parsed.basicInfo.phone || existingProfile?.phone || null,
      location: parsed.basicInfo.location || existingProfile?.location || 'Unknown',
      workAuthorization: existingProfile?.workAuthorization || 'OTHER',
      linkedinUrl: parsed.basicInfo.linkedinUrl || existingProfile?.linkedinUrl || null,
      githubUrl: parsed.basicInfo.githubUrl || existingProfile?.githubUrl || null,
      portfolioUrl: parsed.basicInfo.portfolioUrl || existingProfile?.portfolioUrl || null,
      experience: transformedExperience,
      education: transformedEducation,
      projects: transformedProjects,
      skills: parsed.skills.all,
      highlightedSkills: parsed.skills.proficient ?? [],
      certifications: parsed.certifications,
      languages: parsed.languages,
      resumeRawText: parsed.rawText,
      resumeFileRef: existingProfile?.resumeFileRef || null,
      resumeParsedAt: new Date(),
    };

    // Update the profile with parsed data
    await upsertProfile(db, userId, profileData);

    return NextResponse.json({
      success: true,
      parsed: {
        basicInfo: parsed.basicInfo,
        educationCount: parsed.education.length,
        experienceCount: parsed.experience.length,
        projectsCount: parsed.projects.length,
        skillsCount: parsed.skills.all.length,
      },
      message: 'Resume parsed successfully',
    });
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Parse resume error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to parse resume' },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const userId = await getRequiredUserId();
    const db = getDb();
    const profile = await getProfileByUserId(db, userId);

    if (!profile) {
      return NextResponse.json({ parsed: false, data: null });
    }

    // Consider parsed if we have resumeParsedAt OR persisted section data (so UI can show data from DB even if set by form save)
    const hasSectionData =
      (Array.isArray(profile.experience) && profile.experience.length > 0) ||
      (Array.isArray(profile.projects) && profile.projects.length > 0) ||
      (Array.isArray(profile.education) && profile.education.length > 0) ||
      (Array.isArray(profile.skills) && profile.skills.length > 0);
    const isParsed = !!profile.resumeParsedAt || hasSectionData;

    return NextResponse.json(
      {
        parsed: isParsed,
        parsedAt: profile.resumeParsedAt,
        data: isParsed
          ? {
              basicInfo: {
                name: profile.name,
                email: profile.email,
                phone: profile.phone,
                location: profile.location,
                linkedinUrl: profile.linkedinUrl,
                githubUrl: profile.githubUrl,
                portfolioUrl: profile.portfolioUrl,
              },
              experience: profile.experience,
              education: profile.education,
              projects: profile.projects,
              skills: profile.skills,
              highlightedSkills: profile.highlightedSkills ?? [],
              certifications: profile.certifications,
              languages: profile.languages,
            }
          : null,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get parsed resume error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to get parsed resume data' },
      { status: 500 },
    );
  }
}
