'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { ParsingTerminal } from '../components/ParsingTerminal';
import { useToast } from '../components/ToastContext';
import { useReportAction } from '../components/UserActivityProvider';

const WORK_AUTH_OPTIONS = ['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER'] as const;

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  location: string;
  work_authorization: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
}

interface ResumeStatus {
  hasResume: boolean;
  filename: string | null;
}

interface Experience {
  company: string;
  title: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  bullets?: string[];
  bullet_scores?: BulletScore[];
}

interface Education {
  institution: string;
  degree?: string | null;
  field?: string | null;
  gpa?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  coursework?: string[];
  awards?: string[];
}

interface Project {
  name: string;
  context?: string | null;
  dates?: string | null;
  description?: string | null;
  technologies?: string[];
  bullets?: string[];
  achievements?: string[];
  bullet_scores?: BulletScore[];
}

interface ParsedData {
  parsed: boolean;
  parsedAt?: string | null;
  data?: {
    basicInfo: {
      name: string;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
      linkedinUrl?: string | null;
      githubUrl?: string | null;
      portfolioUrl?: string | null;
    };
    experience?: Experience[];
    education?: Education[];
    projects?: Project[];
    skills?: string[];
    highlightedSkills?: string[];
    certifications?: string[];
    languages?: string[];
  } | null;
}

interface BulletScore {
  bullet: string;
  score: number;
  feedback: string;
}

function isProfileComplete(form: ProfileForm, resume: ResumeStatus): boolean {
  return !!(
    form.name.trim() &&
    form.location.trim() &&
    form.work_authorization &&
    resume.hasResume
  );
}

// Edit icon SVG
function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Analysis icon SVG
function AnalyzeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  );
}

// X icon SVG
function XIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Plus icon SVG
function PlusIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// Trash icon SVG
function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// Minus icon SVG
function MinusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function ProfilePage() {
  const reportAction = useReportAction();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  const [form, setForm] = useState<ProfileForm>({
    name: '',
    email: '',
    phone: '',
    location: '',
    work_authorization: 'OTHER',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
  });

  const [resume, setResume] = useState<ResumeStatus>({ hasResume: false, filename: null });
  const [parsedData, setParsedData] = useState<ParsedData>({ parsed: false });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable state for parsed sections
  const [editableExperience, setEditableExperience] = useState<Experience[]>([]);
  const [editableProjects, setEditableProjects] = useState<Project[]>([]);
  const [editableEducation, setEditableEducation] = useState<Education[]>([]);
  const [editableSkills, setEditableSkills] = useState<string[]>([]);
  const [highlightedSkills, setHighlightedSkills] = useState<Set<string>>(new Set());
  const [editableLanguages, setEditableLanguages] = useState<string[]>([]);

  // Edit mode tracking per section
  const [editingExpIdx, setEditingExpIdx] = useState<number | null>(null);
  const [editingProjIdx, setEditingProjIdx] = useState<number | null>(null);
  const [editingEduIdx, setEditingEduIdx] = useState<number | null>(null);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingLanguages, setEditingLanguages] = useState(false);

  // Analyze state
  const [analyzingExpIdx, setAnalyzingExpIdx] = useState<number | null>(null);
  const [analyzingProjIdx, setAnalyzingProjIdx] = useState<number | null>(null);
  const [analyzingAllBullets, setAnalyzingAllBullets] = useState(false);
  const [bulletScores, setBulletScores] = useState<Map<string, BulletScore[]>>(new Map());

  // Add modal state (popup for new experience / project / education)
  const [addModal, setAddModal] = useState<'experience' | 'project' | 'education' | null>(null);
  const [draftExperience, setDraftExperience] = useState<Experience | null>(null);
  const [draftProject, setDraftProject] = useState<Project | null>(null);
  const [draftEducation, setDraftEducation] = useState<Education | null>(null);

  // Delete profile confirmation
  const [showDeleteProfileConfirm, setShowDeleteProfileConfirm] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);

  // Per-card delete confirmation: { type, index }
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'experience' | 'project' | 'education';
    index: number;
  } | null>(null);

  // Suggested skills (from analyze-skills, persisted in DB)
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const [analyzingSkills, setAnalyzingSkills] = useState(false);

  const fetchParsedData = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/parse-resume', { cache: 'no-store' });
      const data = await res.json();
      setParsedData(data);
      // Initialize editable state
      if (data?.data) {
        setEditableExperience(data.data.experience || []);
        setEditableProjects(data.data.projects || []);
        setEditableEducation(data.data.education || []);
        setEditableSkills(data.data.skills || []);
        setEditableLanguages(data.data.languages || []);
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/profile', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/profile/resume', { cache: 'no-store' }).then((r) => r.json()),
      fetchParsedData(),
    ])
      .then(([profileData, resumeData, parsedData]) => {
        if (profileData?.name) {
          setForm({
            name: profileData.name,
            email: profileData.email ?? '',
            phone: profileData.phone ?? '',
            location: profileData.location ?? '',
            work_authorization: profileData.workAuthorization ?? 'OTHER',
            linkedin_url: profileData.linkedinUrl ?? '',
            github_url: profileData.githubUrl ?? '',
            portfolio_url: profileData.portfolioUrl ?? '',
          });
          if (profileData.highlightedSkills && Array.isArray(profileData.highlightedSkills)) {
            setHighlightedSkills(new Set(profileData.highlightedSkills));
          }
          if (Array.isArray(profileData.suggestedSkills)) {
            setSuggestedSkills(profileData.suggestedSkills);
          }
          // Always prefer profile data when present (persisted from DB after parse)
          if (Array.isArray(profileData.experience)) {
            setEditableExperience(profileData.experience);
          }
          if (Array.isArray(profileData.projects)) {
            setEditableProjects(profileData.projects);
          }
          if (Array.isArray(profileData.education)) {
            setEditableEducation(profileData.education);
          }
          if (Array.isArray(profileData.skills)) {
            setEditableSkills(profileData.skills);
          }
          if (Array.isArray(profileData.languages)) {
            setEditableLanguages(profileData.languages);
          }
        }
        // Fallback: if no profile or profile arrays missing, use parsed endpoint data
        if (!Array.isArray(profileData?.experience) && parsedData?.data?.experience?.length) {
          setEditableExperience(parsedData.data.experience);
        }
        if (!Array.isArray(profileData?.projects) && parsedData?.data?.projects?.length) {
          setEditableProjects(parsedData.data.projects);
        }
        if (!Array.isArray(profileData?.education) && parsedData?.data?.education?.length) {
          setEditableEducation(parsedData.data.education);
        }
        if (!Array.isArray(profileData?.skills) && parsedData?.data?.skills?.length) {
          setEditableSkills(parsedData.data.skills);
        }
        if (!Array.isArray(profileData?.languages) && parsedData?.data?.languages?.length) {
          setEditableLanguages(parsedData.data.languages);
        }
        if (resumeData) {
          setResume({
            hasResume: resumeData.hasResume ?? false,
            filename: resumeData.filename ?? null,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [fetchParsedData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: editableExperience,
          projects: editableProjects,
          education: editableEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      reportAction('save_profile');
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async () => {
    const expIdx = editingExpIdx;
    const projIdx = editingProjIdx;
    const experienceToSave =
      expIdx !== null
        ? editableExperience.map((e, i) => (i === expIdx ? { ...e, bullet_scores: undefined } : e))
        : editableExperience;
    const projectsToSave =
      projIdx !== null
        ? editableProjects.map((p, i) => (i === projIdx ? { ...p, bullet_scores: undefined } : p))
        : editableProjects;

    setSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: experienceToSave,
          projects: projectsToSave,
          education: editableEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      reportAction('save_profile');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditingExpIdx(null);
      setEditingProjIdx(null);
      if (expIdx !== null) {
        setEditableExperience(experienceToSave);
        handleAnalyzeExperience(expIdx);
      }
      if (projIdx !== null) {
        setEditableProjects(projectsToSave);
        handleAnalyzeProject(projIdx);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await fetch('/api/profile/resume', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
      } else {
        setResume({ hasResume: true, filename: data.filename });
        setShowTerminal(true);
      }
    } catch {
      setUploadError('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteResume = async () => {
    try {
      await fetch('/api/profile/resume', { method: 'DELETE' });
      reportAction('delete_resume');
      setResume({ hasResume: false, filename: null });
      setParsedData({ parsed: false });
    } catch {
      // ignore
    }
  };

  const handleParseResume = () => {
    reportAction('parse_resume');
    setShowTerminal(true);
  };

  const handleParsingComplete = async () => {
    const parsed = await fetchParsedData();
    if (parsed?.data?.basicInfo) {
      setForm((f) => ({
        ...f,
        name: parsed.data.basicInfo.name || f.name,
        email: parsed.data.basicInfo.email || f.email,
        phone: parsed.data.basicInfo.phone || f.phone,
        location: parsed.data.basicInfo.location || f.location,
        linkedin_url: parsed.data.basicInfo.linkedinUrl || f.linkedin_url,
        github_url: parsed.data.basicInfo.githubUrl || f.github_url,
        portfolio_url: parsed.data.basicInfo.portfolioUrl || f.portfolio_url,
      }));
    }
    const experience = parsed?.data?.experience ?? [];
    const projects = parsed?.data?.projects ?? [];
    setEditableExperience(experience);
    setEditableProjects(projects);
    if (parsed?.data?.education?.length) setEditableEducation(parsed.data.education);
    if (parsed?.data?.skills?.length) setEditableSkills(parsed.data.skills);
    if (parsed?.data?.languages?.length) setEditableLanguages(parsed.data.languages);
    if (parsed?.data?.highlightedSkills && Array.isArray(parsed.data.highlightedSkills)) {
      setHighlightedSkills(new Set(parsed.data.highlightedSkills));
    }
    setShowTerminal(false);

    const hasBulletsToAnalyze =
      experience.some((e: Experience) => (e.bullets?.length ?? 0) > 0) ||
      projects.some((p: Project) => (p.bullets?.length ?? 0) > 0);
    if (!hasBulletsToAnalyze) return;

    addToast('Bullet analyzer started.', 'success');
    setAnalyzingAllBullets(true);
    try {
      const newExperience = [...experience] as (Experience & { bullet_scores?: BulletScore[] })[];
      const newProjects = [...projects] as (Project & { bullet_scores?: BulletScore[] })[];

      for (let i = 0; i < newExperience.length; i++) {
        const exp = newExperience[i];
        if (exp.bullets?.length) {
          try {
            const res = await fetch('/api/profile/analyze-bullets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                company: exp.company,
                title: exp.title,
                bullets: exp.bullets,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              newExperience[i] = { ...exp, bullet_scores: data.scores };
              setBulletScores((prev) => new Map(prev).set(`exp-${i}`, data.scores));
              setEditableExperience([...newExperience]);
            }
          } catch {
            // skip this item
          }
        }
      }

      for (let i = 0; i < newProjects.length; i++) {
        const proj = newProjects[i];
        if (proj.bullets?.length) {
          try {
            const res = await fetch('/api/profile/analyze-bullets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'project',
                name: proj.name,
                context: proj.context || '',
                bullets: proj.bullets,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              newProjects[i] = { ...proj, bullet_scores: data.scores };
              setBulletScores((prev) => new Map(prev).set(`proj-${i}`, data.scores));
              setEditableProjects([...newProjects]);
            }
          } catch {
            // skip this item
          }
        }
      }

      setEditableExperience(newExperience);
      setEditableProjects(newProjects);

      const profileRes = await fetch('/api/profile');
      const profile = await profileRes.json();
      if (profile?.name) {
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: profile.name,
            location: profile.location,
            work_authorization: profile.workAuthorization ?? 'OTHER',
            email: profile.email ?? '',
            phone: profile.phone ?? '',
            linkedin_url: profile.linkedinUrl ?? '',
            github_url: profile.githubUrl ?? '',
            portfolio_url: profile.portfolioUrl ?? '',
            experience: newExperience,
            projects: newProjects,
            education: profile.education ?? [],
            skills: profile.skills ?? [],
            highlighted_skills: profile.highlightedSkills ?? [],
            languages: profile.languages ?? [],
          }),
        });
      }
      addToast('All bullet analyses finished.', 'success');
    } catch {
      addToast('Bullet analysis failed.', 'error');
    } finally {
      setAnalyzingAllBullets(false);
    }
  };

  const handleAnalyzeExperience = async (expIdx: number) => {
    setAnalyzingExpIdx(expIdx);
    const exp = editableExperience[expIdx];
    if (!exp) return;

    addToast('Bullet analyzer started.', 'success');
    try {
      const res = await fetch('/api/profile/analyze-bullets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: exp.company,
          title: exp.title,
          bullets: exp.bullets || [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newExperience = editableExperience.map((e, i) =>
          i === expIdx ? { ...e, bullet_scores: data.scores } : e,
        );
        setEditableExperience(newExperience);
        setBulletScores((prev) => new Map(prev).set(`exp-${expIdx}`, data.scores));
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            experience: newExperience,
            projects: editableProjects,
            education: editableEducation,
            skills: editableSkills,
            highlighted_skills: Array.from(highlightedSkills),
            languages: editableLanguages,
          }),
        });
        addToast('Bullet analysis finished.', 'success');
      }
    } catch {
      addToast('Bullet analysis failed.', 'error');
    } finally {
      setAnalyzingExpIdx(null);
    }
  };

  const handleAnalyzeProject = async (projIdx: number) => {
    setAnalyzingProjIdx(projIdx);
    const proj = editableProjects[projIdx];
    if (!proj) return;

    addToast('Bullet analyzer started.', 'success');
    try {
      const res = await fetch('/api/profile/analyze-bullets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'project',
          name: proj.name,
          context: proj.context || '',
          bullets: proj.bullets || [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newProjects = editableProjects.map((p, i) =>
          i === projIdx ? { ...p, bullet_scores: data.scores } : p,
        );
        setEditableProjects(newProjects);
        setBulletScores((prev) => new Map(prev).set(`proj-${projIdx}`, data.scores));
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            experience: editableExperience,
            projects: newProjects,
            education: editableEducation,
            skills: editableSkills,
            highlighted_skills: Array.from(highlightedSkills),
            languages: editableLanguages,
          }),
        });
        addToast('Bullet analysis finished.', 'success');
      }
    } catch {
      addToast('Bullet analysis failed.', 'error');
    } finally {
      setAnalyzingProjIdx(null);
    }
  };

  const toggleSkillHighlight = (skill: string) => {
    setHighlightedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  const removeSkill = (skill: string) => {
    setEditableSkills((prev) => prev.filter((s) => s !== skill));
    setHighlightedSkills((prev) => {
      const next = new Set(prev);
      next.delete(skill);
      return next;
    });
  };

  const canSaveProfile = !!(form.name.trim() && form.location.trim() && form.work_authorization);

  const openAddExperience = () => {
    if (!canSaveProfile) return;
    setDraftExperience({
      company: '',
      title: '',
      location: null,
      start_date: null,
      end_date: null,
      description: null,
      bullets: [],
      bullet_scores: undefined,
    });
    setAddModal('experience');
  };

  const openAddProject = () => {
    if (!canSaveProfile) return;
    setDraftProject({
      name: '',
      context: null,
      dates: null,
      description: null,
      technologies: [],
      bullets: [],
      achievements: [],
      bullet_scores: undefined,
    });
    setAddModal('project');
  };

  const openAddEducation = () => {
    if (!canSaveProfile) return;
    setDraftEducation({
      institution: '',
      degree: null,
      field: null,
      gpa: null,
      start_date: null,
      end_date: null,
      coursework: [],
      awards: [],
    });
    setAddModal('education');
  };

  const closeAddModal = () => {
    setAddModal(null);
    setDraftExperience(null);
    setDraftProject(null);
    setDraftEducation(null);
  };

  const canSaveDraftExperience = !!(
    draftExperience &&
    draftExperience.title.trim() &&
    draftExperience.company.trim() &&
    draftExperience.location?.trim() &&
    draftExperience.start_date?.trim() &&
    draftExperience.end_date?.trim() &&
    (draftExperience.bullets?.length ?? 0) >= 1 &&
    (draftExperience.bullets ?? []).some((b) => b.trim().length > 0)
  );
  const canSaveDraftProject = !!(
    draftProject &&
    draftProject.name.trim() &&
    draftProject.context?.trim() &&
    draftProject.dates?.trim() &&
    (draftProject.bullets?.length ?? 0) >= 1 &&
    (draftProject.bullets ?? []).some((b) => b.trim().length > 0)
  );
  const canSaveDraftEducation = !!(
    draftEducation &&
    draftEducation.institution.trim() &&
    draftEducation.degree?.trim() &&
    draftEducation.field?.trim() &&
    draftEducation.start_date?.trim() &&
    draftEducation.end_date?.trim()
  );

  const saveAddExperience = async () => {
    if (!draftExperience || !canSaveDraftExperience) return;
    let experienceToSave: Experience[] = [
      ...editableExperience,
      { ...draftExperience, bullet_scores: undefined },
    ];
    setEditableExperience(experienceToSave);
    setSaving(true);
    try {
      if ((draftExperience.bullets?.length ?? 0) > 0) {
        const res = await fetch('/api/profile/analyze-bullets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: draftExperience.company,
            title: draftExperience.title,
            bullets: draftExperience.bullets || [],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          experienceToSave = [
            ...editableExperience,
            { ...draftExperience, bullet_scores: data.scores },
          ];
          setEditableExperience(experienceToSave);
          setBulletScores((prev) =>
            new Map(prev).set(`exp-${experienceToSave.length - 1}`, data.scores),
          );
        }
      }
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: experienceToSave,
          projects: editableProjects,
          education: editableEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      reportAction('save_profile');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      closeAddModal();
    } finally {
      setSaving(false);
    }
  };

  const saveAddProject = async () => {
    if (!draftProject || !canSaveDraftProject) return;
    let projectsToSave: Project[] = [
      ...editableProjects,
      { ...draftProject, bullet_scores: undefined },
    ];
    setEditableProjects(projectsToSave);
    setSaving(true);
    try {
      if ((draftProject.bullets?.length ?? 0) > 0) {
        const res = await fetch('/api/profile/analyze-bullets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'project',
            name: draftProject.name,
            context: draftProject.context || '',
            bullets: draftProject.bullets || [],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          projectsToSave = [...editableProjects, { ...draftProject, bullet_scores: data.scores }];
          setEditableProjects(projectsToSave);
          setBulletScores((prev) =>
            new Map(prev).set(`proj-${projectsToSave.length - 1}`, data.scores),
          );
        }
      }
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: editableExperience,
          projects: projectsToSave,
          education: editableEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      reportAction('save_profile');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      closeAddModal();
    } finally {
      setSaving(false);
    }
  };

  const saveAddEducation = async () => {
    if (!draftEducation || !canSaveDraftEducation) return;
    const newEducation = [...editableEducation, draftEducation];
    setEditableEducation(newEducation);
    setSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: editableExperience,
          projects: editableProjects,
          education: newEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      reportAction('save_profile');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      closeAddModal();
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    setEditingSkills(true);
  };

  const handleAnalyzeSkills = async () => {
    addToast('Skills analyzer started.', 'success');
    setAnalyzingSkills(true);
    try {
      const res = await fetch('/api/profile/analyze-skills', { method: 'POST' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.suggestedSkills)) {
        setSuggestedSkills(data.suggestedSkills);
        addToast('Skills analysis finished.', 'success');
      } else {
        addToast('Skills analysis failed.', 'error');
      }
    } catch {
      addToast('Skills analysis failed.', 'error');
    } finally {
      setAnalyzingSkills(false);
    }
  };

  const confirmDeleteCard = (type: 'experience' | 'project' | 'education', index: number) => {
    setDeleteConfirm({ type, index });
  };

  const handleConfirmDeleteCard = async () => {
    if (!deleteConfirm) return;
    const { type, index } = deleteConfirm;
    setSaving(true);
    try {
      if (type === 'experience') {
        const next = editableExperience.filter((_, i) => i !== index);
        setEditableExperience(next);
        setEditingExpIdx(null);
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            experience: next,
            projects: editableProjects,
            education: editableEducation,
            skills: editableSkills,
            highlighted_skills: Array.from(highlightedSkills),
            languages: editableLanguages,
          }),
        });
      } else if (type === 'project') {
        const next = editableProjects.filter((_, i) => i !== index);
        setEditableProjects(next);
        setEditingProjIdx(null);
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            experience: editableExperience,
            projects: next,
            education: editableEducation,
            skills: editableSkills,
            highlighted_skills: Array.from(highlightedSkills),
            languages: editableLanguages,
          }),
        });
      } else {
        const next = editableEducation.filter((_, i) => i !== index);
        setEditableEducation(next);
        setEditingEduIdx(null);
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            experience: editableExperience,
            projects: editableProjects,
            education: next,
            skills: editableSkills,
            highlighted_skills: Array.from(highlightedSkills),
            languages: editableLanguages,
          }),
        });
      }
      reportAction('save_profile');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setDeleteConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    setDeletingProfile(true);
    try {
      const res = await fetch('/api/profile', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reset profile');
      setShowDeleteProfileConfirm(false);
      reportAction('delete_profile');
      // Refetch profile and reset local state to match
      const [profileData, resumeData, parsedData] = await Promise.all([
        fetch('/api/profile', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/profile/resume', { cache: 'no-store' }).then((r) => r.json()),
        fetchParsedData(),
      ]);
      if (profileData?.name) {
        setForm({
          name: profileData.name,
          email: profileData.email ?? '',
          phone: profileData.phone ?? '',
          location: profileData.location ?? '',
          work_authorization: profileData.workAuthorization ?? 'OTHER',
          linkedin_url: profileData.linkedinUrl ?? '',
          github_url: profileData.githubUrl ?? '',
          portfolio_url: profileData.portfolioUrl ?? '',
        });
        setHighlightedSkills(
          new Set(
            Array.isArray(profileData.highlightedSkills) ? profileData.highlightedSkills : [],
          ),
        );
      }
      setEditableExperience(Array.isArray(profileData?.experience) ? profileData.experience : []);
      setEditableProjects(Array.isArray(profileData?.projects) ? profileData.projects : []);
      setEditableEducation(Array.isArray(profileData?.education) ? profileData.education : []);
      setEditableSkills(Array.isArray(profileData?.skills) ? profileData.skills : []);
      setEditableLanguages(Array.isArray(profileData?.languages) ? profileData.languages : []);
      setSuggestedSkills(
        Array.isArray(profileData?.suggestedSkills) ? profileData.suggestedSkills : [],
      );
      setParsedData(parsedData || { parsed: false });
      setResume({
        hasResume: resumeData?.hasResume ?? false,
        filename: resumeData?.filename ?? null,
      });
      setEditingExpIdx(null);
      setEditingProjIdx(null);
      setEditingEduIdx(null);
      setIsEditing(false);
    } finally {
      setDeletingProfile(false);
    }
  };

  if (loading) return <p>Loading profile…</p>;

  const complete = isProfileComplete(form, resume);
  const hasParsedData = parsedData.parsed && parsedData.data;
  const showProfileSections = (hasParsedData || resume.hasResume) && !isEditing;

  return (
    <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
      {/* Add modals (popup on top) */}
      {addModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => e.target === e.currentTarget && closeAddModal()}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              maxWidth: '32rem',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '1.5rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {addModal === 'experience' && draftExperience && (
              <>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Add Work Experience</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={draftExperience.title}
                      onChange={(e) =>
                        setDraftExperience((d) => (d ? { ...d, title: e.target.value } : d))
                      }
                      placeholder="Job Title *"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftExperience.company}
                      onChange={(e) =>
                        setDraftExperience((d) => (d ? { ...d, company: e.target.value } : d))
                      }
                      placeholder="Company *"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftExperience.location || ''}
                      onChange={(e) =>
                        setDraftExperience((d) =>
                          d ? { ...d, location: e.target.value || null } : d,
                        )
                      }
                      placeholder="Location"
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={draftExperience.start_date || ''}
                        onChange={(e) =>
                          setDraftExperience((d) =>
                            d ? { ...d, start_date: e.target.value || null } : d,
                          )
                        }
                        placeholder="Start Date"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <input
                        type="text"
                        value={draftExperience.end_date || ''}
                        onChange={(e) =>
                          setDraftExperience((d) =>
                            d ? { ...d, end_date: e.target.value || null } : d,
                          )
                        }
                        placeholder="End Date"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Bullet points
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftExperience((d) =>
                            d ? { ...d, bullets: [...(d.bullets || []), ''] } : d,
                          )
                        }
                        style={{ ...iconButtonStyle, color: 'var(--accent)' }}
                        title="Add bullet"
                      >
                        <PlusIcon size={16} />
                      </button>
                    </div>
                    {(draftExperience.bullets || []).length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Click + to add a bullet point.
                      </p>
                    ) : (
                      (draftExperience.bullets || []).map((bullet, bidx) => (
                        <div
                          key={bidx}
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <input
                            type="text"
                            value={bullet}
                            onChange={(e) =>
                              setDraftExperience((d) => {
                                if (!d?.bullets) return d;
                                const next = [...d.bullets];
                                next[bidx] = e.target.value;
                                return { ...d, bullets: next };
                              })
                            }
                            placeholder={`Bullet ${bidx + 1}`}
                            style={{ ...inputStyle, flex: 1, marginTop: 0 }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraftExperience((d) => {
                                if (!d?.bullets) return d;
                                const next = d.bullets.filter((_, i) => i !== bidx);
                                return { ...d, bullets: next };
                              })
                            }
                            style={{ ...iconButtonStyle, color: '#ef4444', flexShrink: 0 }}
                            title="Remove bullet"
                          >
                            <MinusIcon />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: '1.25rem',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button type="button" onClick={closeAddModal} style={smallButtonStyle}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveAddExperience}
                    disabled={saving || !canSaveDraftExperience}
                    style={buttonStyle}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
            {addModal === 'project' && draftProject && (
              <>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Add Project</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={draftProject.name}
                      onChange={(e) =>
                        setDraftProject((d) => (d ? { ...d, name: e.target.value } : d))
                      }
                      placeholder="Project Name *"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftProject.context || ''}
                      onChange={(e) =>
                        setDraftProject((d) => (d ? { ...d, context: e.target.value || null } : d))
                      }
                      placeholder="Context (e.g., Hackathon, Personal)"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftProject.dates || ''}
                      onChange={(e) =>
                        setDraftProject((d) => (d ? { ...d, dates: e.target.value || null } : d))
                      }
                      placeholder="Dates"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={(draftProject.technologies || []).join(', ')}
                      onChange={(e) =>
                        setDraftProject((d) =>
                          d
                            ? {
                                ...d,
                                technologies: e.target.value.split(',').map((t) => t.trim()),
                              }
                            : d,
                        )
                      }
                      placeholder="Technologies (comma separated)"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Bullet points
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftProject((d) =>
                            d ? { ...d, bullets: [...(d.bullets || []), ''] } : d,
                          )
                        }
                        style={{ ...iconButtonStyle, color: 'var(--accent)' }}
                        title="Add bullet"
                      >
                        <PlusIcon size={16} />
                      </button>
                    </div>
                    {(draftProject.bullets || []).length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Click + to add a bullet point.
                      </p>
                    ) : (
                      (draftProject.bullets || []).map((bullet, bidx) => (
                        <div
                          key={bidx}
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <input
                            type="text"
                            value={bullet}
                            onChange={(e) =>
                              setDraftProject((d) => {
                                if (!d?.bullets) return d;
                                const next = [...d.bullets];
                                next[bidx] = e.target.value;
                                return { ...d, bullets: next };
                              })
                            }
                            placeholder={`Bullet ${bidx + 1}`}
                            style={{ ...inputStyle, flex: 1, marginTop: 0 }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraftProject((d) => {
                                if (!d?.bullets) return d;
                                const next = d.bullets.filter((_, i) => i !== bidx);
                                return { ...d, bullets: next };
                              })
                            }
                            style={{ ...iconButtonStyle, color: '#ef4444', flexShrink: 0 }}
                            title="Remove bullet"
                          >
                            <MinusIcon />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: '1.25rem',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button type="button" onClick={closeAddModal} style={smallButtonStyle}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveAddProject}
                    disabled={saving || !canSaveDraftProject}
                    style={buttonStyle}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
            {addModal === 'education' && draftEducation && (
              <>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Add Education</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={draftEducation.institution}
                      onChange={(e) =>
                        setDraftEducation((d) => (d ? { ...d, institution: e.target.value } : d))
                      }
                      placeholder="Institution *"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftEducation.degree || ''}
                      onChange={(e) =>
                        setDraftEducation((d) => (d ? { ...d, degree: e.target.value || null } : d))
                      }
                      placeholder="Degree"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftEducation.field || ''}
                      onChange={(e) =>
                        setDraftEducation((d) => (d ? { ...d, field: e.target.value || null } : d))
                      }
                      placeholder="Field of Study"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftEducation.gpa || ''}
                      onChange={(e) =>
                        setDraftEducation((d) => (d ? { ...d, gpa: e.target.value || null } : d))
                      }
                      placeholder="GPA"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftEducation.start_date || ''}
                      onChange={(e) =>
                        setDraftEducation((d) =>
                          d ? { ...d, start_date: e.target.value || null } : d,
                        )
                      }
                      placeholder="Start Date"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={draftEducation.end_date || ''}
                      onChange={(e) =>
                        setDraftEducation((d) =>
                          d ? { ...d, end_date: e.target.value || null } : d,
                        )
                      }
                      placeholder="End Date"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: '1.25rem',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button type="button" onClick={closeAddModal} style={smallButtonStyle}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveAddEducation}
                    disabled={saving || !canSaveDraftEducation}
                    style={buttonStyle}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Per-card delete confirmation modal */}
      {deleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '1rem',
          }}
          onClick={() => !saving && setDeleteConfirm(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              maxWidth: '24rem',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>Delete this entry?</h3>
            <p style={{ margin: '0 0 1.25rem 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
              Are you sure you want to delete this{' '}
              {deleteConfirm.type === 'experience'
                ? 'work experience'
                : deleteConfirm.type === 'project'
                  ? 'project'
                  : 'education'}
              ? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={saving}
                style={smallButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCard}
                disabled={saving}
                style={{ ...buttonStyle, background: '#ef4444' }}
              >
                {saving ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Delete Profile */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Profile</h1>
        <button
          type="button"
          onClick={() => setShowDeleteProfileConfirm(true)}
          style={{
            ...smallButtonStyle,
            color: '#ef4444',
            borderColor: 'rgba(239, 68, 68, 0.5)',
          }}
        >
          Delete Profile
        </button>
      </div>

      {/* Delete Profile confirmation modal */}
      {showDeleteProfileConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '1rem',
          }}
          onClick={() => !deletingProfile && setShowDeleteProfileConfirm(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              maxWidth: '24rem',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>Delete profile?</h3>
            <p style={{ margin: '0 0 1.25rem 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
              Everything except your name and email will be removed. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowDeleteProfileConfirm(false)}
                disabled={deletingProfile}
                style={smallButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProfile}
                disabled={deletingProfile}
                style={{ ...buttonStyle, background: '#ef4444' }}
              >
                {deletingProfile ? 'Deleting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Status */}
      <div
        style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          borderRadius: 8,
          background: complete ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
          border: `1px solid ${complete ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
        }}
      >
        <strong style={{ color: complete ? '#22c55e' : '#eab308' }}>
          {complete ? 'Profile Complete' : 'Profile Incomplete'}
        </strong>
        <p style={{ margin: '0.5rem 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
          {complete
            ? "You're all set! Your profile and resume are ready."
            : 'Please fill in your name, location, work authorization, and upload your resume.'}
        </p>
      </div>

      {/* Resume Upload Section */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Resume</h2>
        {resume.hasResume ? (
          <div
            style={{
              padding: '1rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <strong style={{ color: '#22c55e' }}>Resume uploaded</strong>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {resume.filename}
                  {parsedData.parsed && parsedData.parsedAt && !showTerminal && (
                    <> · Parsed {new Date(parsedData.parsedAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!showTerminal && (
                  <button
                    type="button"
                    onClick={handleParseResume}
                    style={{ ...smallButtonStyle, background: 'var(--accent)', color: 'white' }}
                  >
                    {parsedData.parsed ? 'Re-parse' : 'Parse'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteResume}
                  style={smallButtonStyle}
                  disabled={showTerminal}
                >
                  Remove
                </button>
              </div>
            </div>
            <ParsingTerminal isActive={showTerminal} onComplete={handleParsingComplete} />
            {analyzingAllBullets && (
              <p
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: 6,
                  fontSize: '0.9rem',
                  color: 'var(--text)',
                }}
              >
                Analyzing bullet points for experience and projects…
              </p>
            )}
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ display: 'none' }}
              id="resume-upload"
            />
            <label
              htmlFor="resume-upload"
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: 'var(--surface)',
                border: '2px dashed var(--border)',
                borderRadius: 8,
                cursor: uploading ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {uploading ? 'Uploading…' : 'Click to upload resume (PDF, DOCX, DOC, TXT - Max 10MB)'}
            </label>
            {uploadError && (
              <p style={{ color: '#ef4444', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                {uploadError}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Basic Info Section */}
      <section style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Basic Info</h2>
          {resume.hasResume && (
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              style={{
                ...buttonStyle,
                background: isEditing ? 'var(--muted)' : 'var(--accent)',
              }}
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>
        {isEditing ? (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Name *
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                Location *
                <input
                  type="text"
                  required
                  placeholder="e.g., San Francisco, CA"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                Work Authorization *
                <select
                  value={form.work_authorization}
                  onChange={(e) => setForm((f) => ({ ...f, work_authorization: e.target.value }))}
                  style={inputStyle}
                >
                  {WORK_AUTH_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                LinkedIn URL
                <input
                  type="url"
                  value={form.linkedin_url}
                  onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://linkedin.com/in/..."
                />
              </label>
              <label>
                GitHub URL
                <input
                  type="url"
                  value={form.github_url}
                  onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://github.com/..."
                />
              </label>
              <label>
                Portfolio URL
                <input
                  type="url"
                  value={form.portfolio_url}
                  onChange={(e) => setForm((f) => ({ ...f, portfolio_url: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://..."
                />
              </label>
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}
            >
              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
              {saved && <span style={{ color: '#22c55e', fontSize: '0.9rem' }}>Saved!</span>}
            </div>
          </form>
        ) : (
          <div style={{ ...cardStyle }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <InfoRow label="Name" value={form.name} />
              <InfoRow label="Email" value={form.email} />
              <InfoRow label="Phone" value={form.phone} />
              <InfoRow label="Location" value={form.location} />
              <InfoRow
                label="Work Authorization"
                value={form.work_authorization.replace(/_/g, ' ')}
              />
              {form.linkedin_url && <InfoRow label="LinkedIn" value={form.linkedin_url} isLink />}
              {form.github_url && <InfoRow label="GitHub" value={form.github_url} isLink />}
              {form.portfolio_url && (
                <InfoRow label="Portfolio" value={form.portfolio_url} isLink />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Parsed Resume Data / Profile sections (when resume exists) */}
      {showProfileSections && (
        <>
          {/* Education */}
          <section style={{ marginBottom: '2rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Education</h2>
              <button
                type="button"
                onClick={openAddEducation}
                disabled={saving || !canSaveProfile}
                style={{
                  ...iconButtonStyle,
                  color: canSaveProfile ? 'var(--accent)' : 'var(--muted)',
                }}
                title={canSaveProfile ? 'Add education' : 'Complete Basic Info first'}
              >
                <PlusIcon />
              </button>
            </div>
            {editableEducation.length === 0 ? (
              <div
                style={{
                  ...cardStyle,
                  color: 'var(--muted)',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  padding: '1.5rem',
                }}
              >
                No education entries yet. Click + to add one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editableEducation.map((edu, idx) => (
                  <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        display: 'flex',
                        gap: '0.5rem',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingEduIdx(editingEduIdx === idx ? null : idx)}
                        style={{
                          ...iconButtonStyle,
                          color: editingEduIdx === idx ? '#3b82f6' : 'var(--muted)',
                        }}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDeleteCard('education', idx)}
                        style={{ ...iconButtonStyle, color: '#ef4444' }}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {editingEduIdx === idx ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}
                        >
                          <input
                            type="text"
                            value={edu.institution}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, institution: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Institution"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.degree || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, degree: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Degree"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.field || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, field: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Field of Study"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.gpa || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, gpa: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="GPA"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.start_date || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, start_date: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Start Date"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.end_date || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, end_date: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="End Date"
                            style={inputStyle}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEduIdx(null);
                            saveSection();
                          }}
                          style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingRight: '4.5rem',
                          }}
                        >
                          <div>
                            <strong>{edu.institution}</strong>
                            {(edu.degree || edu.field) && (
                              <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text)' }}>
                                {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                              </p>
                            )}
                            {edu.gpa && (
                              <p
                                style={{
                                  margin: '0.25rem 0 0 0',
                                  color: 'var(--muted)',
                                  fontSize: '0.9rem',
                                }}
                              >
                                GPA: {edu.gpa}
                              </p>
                            )}
                          </div>
                          {(edu.start_date || edu.end_date) && (
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                              {edu.start_date} - {edu.end_date || 'Present'}
                            </span>
                          )}
                        </div>
                        {edu.coursework && edu.coursework.length > 0 && (
                          <p
                            style={{
                              marginTop: '0.5rem',
                              fontSize: '0.85rem',
                              color: 'var(--muted)',
                            }}
                          >
                            <strong>Coursework:</strong> {edu.coursework.join(', ')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Work Experience */}
          <section style={{ marginBottom: '2rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Work Experience</h2>
              <button
                type="button"
                onClick={openAddExperience}
                disabled={saving || !canSaveProfile}
                style={{
                  ...iconButtonStyle,
                  color: canSaveProfile ? 'var(--accent)' : 'var(--muted)',
                }}
                title={canSaveProfile ? 'Add work experience' : 'Complete Basic Info first'}
              >
                <PlusIcon />
              </button>
            </div>
            {editableExperience.length === 0 ? (
              <div
                style={{
                  ...cardStyle,
                  color: 'var(--muted)',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  padding: '1.5rem',
                }}
              >
                No work experience yet. Click + to add one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editableExperience.map((exp, idx) => (
                  <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        display: 'flex',
                        gap: '0.5rem',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingExpIdx(editingExpIdx === idx ? null : idx)}
                        style={{
                          ...iconButtonStyle,
                          color: editingExpIdx === idx ? '#3b82f6' : 'var(--muted)',
                        }}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnalyzeExperience(idx)}
                        disabled={analyzingExpIdx === idx}
                        style={{
                          ...iconButtonStyle,
                          color:
                            (exp.bullet_scores?.length ?? bulletScores.has(`exp-${idx}`))
                              ? '#22c55e'
                              : 'var(--muted)',
                        }}
                        title="Analyze bullet points"
                      >
                        {analyzingExpIdx === idx ? (
                          <span style={{ fontSize: '12px' }}>...</span>
                        ) : (
                          <AnalyzeIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDeleteCard('experience', idx)}
                        style={{ ...iconButtonStyle, color: '#ef4444' }}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {editingExpIdx === idx ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}
                        >
                          <input
                            type="text"
                            value={exp.title}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = { ...exp, title: e.target.value };
                              setEditableExperience(updated);
                            }}
                            placeholder="Job Title"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = { ...exp, company: e.target.value };
                              setEditableExperience(updated);
                            }}
                            placeholder="Company"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={exp.location || ''}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = { ...exp, location: e.target.value };
                              setEditableExperience(updated);
                            }}
                            placeholder="Location"
                            style={inputStyle}
                          />
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="text"
                              value={exp.start_date || ''}
                              onChange={(e) => {
                                const updated = [...editableExperience];
                                updated[idx] = { ...exp, start_date: e.target.value };
                                setEditableExperience(updated);
                              }}
                              placeholder="Start Date"
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <input
                              type="text"
                              value={exp.end_date || ''}
                              onChange={(e) => {
                                const updated = [...editableExperience];
                                updated[idx] = { ...exp, end_date: e.target.value };
                                setEditableExperience(updated);
                              }}
                              placeholder="End Date"
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.5rem',
                            }}
                          >
                            <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                              Bullet points
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...editableExperience];
                                updated[idx] = {
                                  ...exp,
                                  bullets: [...(exp.bullets || []), ''],
                                };
                                setEditableExperience(updated);
                              }}
                              style={{ ...iconButtonStyle, color: 'var(--accent)' }}
                              title="Add bullet"
                            >
                              <PlusIcon size={16} />
                            </button>
                          </div>
                          {(exp.bullets || []).length === 0 ? (
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                              Click + to add a bullet point.
                            </p>
                          ) : (
                            (exp.bullets || []).map((bullet, bidx) => (
                              <div
                                key={bidx}
                                style={{
                                  display: 'flex',
                                  gap: '0.5rem',
                                  alignItems: 'center',
                                  marginBottom: '0.5rem',
                                }}
                              >
                                <input
                                  type="text"
                                  value={bullet}
                                  onChange={(e) => {
                                    const updated = [...editableExperience];
                                    const bullets = [...(exp.bullets || [])];
                                    bullets[bidx] = e.target.value;
                                    updated[idx] = { ...exp, bullets };
                                    setEditableExperience(updated);
                                  }}
                                  placeholder={`Bullet ${bidx + 1}`}
                                  style={{ ...inputStyle, flex: 1, marginTop: 0 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...editableExperience];
                                    const bullets = (exp.bullets || []).filter(
                                      (_, i) => i !== bidx,
                                    );
                                    updated[idx] = { ...exp, bullets };
                                    setEditableExperience(updated);
                                  }}
                                  style={{
                                    ...iconButtonStyle,
                                    color: '#ef4444',
                                    flexShrink: 0,
                                  }}
                                  title="Remove bullet"
                                >
                                  <MinusIcon />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpIdx(null);
                            saveSection();
                          }}
                          style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingRight: '5.5rem',
                          }}
                        >
                          <div>
                            <strong>{exp.title}</strong>
                            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text)' }}>
                              {exp.company}
                              {exp.location && (
                                <span style={{ color: 'var(--muted)' }}> · {exp.location}</span>
                              )}
                            </p>
                          </div>
                          {(exp.start_date || exp.end_date) && (
                            <span
                              style={{
                                color: 'var(--muted)',
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {exp.start_date} - {exp.end_date || 'Present'}
                            </span>
                          )}
                        </div>
                        {exp.bullets && exp.bullets.length > 0 && (
                          <ul
                            style={{
                              marginTop: '0.75rem',
                              paddingLeft: '1.25rem',
                              marginBottom: 0,
                            }}
                          >
                            {exp.bullets.map((bullet, bidx) => {
                              const scores = exp.bullet_scores ?? bulletScores.get(`exp-${idx}`);
                              const score = scores?.[bidx];
                              return (
                                <li
                                  key={bidx}
                                  style={{
                                    fontSize: '0.9rem',
                                    marginBottom: '0.5rem',
                                    color: 'var(--text)',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ flex: 1 }}>{bullet}</span>
                                    {score && (
                                      <span
                                        style={{
                                          fontSize: '0.75rem',
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: 4,
                                          background:
                                            score.score >= 4
                                              ? 'rgba(34, 197, 94, 0.15)'
                                              : score.score >= 3
                                                ? 'rgba(234, 179, 8, 0.15)'
                                                : 'rgba(239, 68, 68, 0.15)',
                                          color:
                                            score.score >= 4
                                              ? '#22c55e'
                                              : score.score >= 3
                                                ? '#eab308'
                                                : '#ef4444',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={score.feedback}
                                      >
                                        {score.score}/5
                                      </span>
                                    )}
                                  </div>
                                  {score && (
                                    <p
                                      style={{
                                        margin: '0.25rem 0 0 0',
                                        fontSize: '0.8rem',
                                        color: 'var(--muted)',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      {score.feedback}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Projects */}
          <section style={{ marginBottom: '2rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Projects</h2>
              <button
                type="button"
                onClick={openAddProject}
                disabled={saving || !canSaveProfile}
                style={{
                  ...iconButtonStyle,
                  color: canSaveProfile ? 'var(--accent)' : 'var(--muted)',
                }}
                title={canSaveProfile ? 'Add project' : 'Complete Basic Info first'}
              >
                <PlusIcon />
              </button>
            </div>
            {editableProjects.length === 0 ? (
              <div
                style={{
                  ...cardStyle,
                  color: 'var(--muted)',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  padding: '1.5rem',
                }}
              >
                No projects yet. Click + to add one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editableProjects.map((proj, idx) => (
                  <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        display: 'flex',
                        gap: '0.5rem',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingProjIdx(editingProjIdx === idx ? null : idx)}
                        style={{
                          ...iconButtonStyle,
                          color: editingProjIdx === idx ? '#3b82f6' : 'var(--muted)',
                        }}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnalyzeProject(idx)}
                        disabled={analyzingProjIdx === idx}
                        style={{
                          ...iconButtonStyle,
                          color:
                            (proj.bullet_scores?.length ?? bulletScores.has(`proj-${idx}`))
                              ? '#22c55e'
                              : 'var(--muted)',
                        }}
                        title="Analyze bullet points"
                      >
                        {analyzingProjIdx === idx ? (
                          <span style={{ fontSize: '12px' }}>...</span>
                        ) : (
                          <AnalyzeIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDeleteCard('project', idx)}
                        style={{ ...iconButtonStyle, color: '#ef4444' }}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {editingProjIdx === idx ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}
                        >
                          <input
                            type="text"
                            value={proj.name}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = { ...proj, name: e.target.value };
                              setEditableProjects(updated);
                            }}
                            placeholder="Project Name"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={proj.context || ''}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = { ...proj, context: e.target.value };
                              setEditableProjects(updated);
                            }}
                            placeholder="Context (e.g., Hackathon, Personal)"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={proj.dates || ''}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = { ...proj, dates: e.target.value };
                              setEditableProjects(updated);
                            }}
                            placeholder="Dates"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={(proj.technologies || []).join(', ')}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = {
                                ...proj,
                                technologies: e.target.value.split(',').map((t) => t.trim()),
                              };
                              setEditableProjects(updated);
                            }}
                            placeholder="Technologies (comma separated)"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.5rem',
                            }}
                          >
                            <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                              Bullet points
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...editableProjects];
                                updated[idx] = {
                                  ...proj,
                                  bullets: [...(proj.bullets || []), ''],
                                };
                                setEditableProjects(updated);
                              }}
                              style={{ ...iconButtonStyle, color: 'var(--accent)' }}
                              title="Add bullet"
                            >
                              <PlusIcon size={16} />
                            </button>
                          </div>
                          {(proj.bullets || []).length === 0 ? (
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                              Click + to add a bullet point.
                            </p>
                          ) : (
                            (proj.bullets || []).map((bullet, bidx) => (
                              <div
                                key={bidx}
                                style={{
                                  display: 'flex',
                                  gap: '0.5rem',
                                  alignItems: 'center',
                                  marginBottom: '0.5rem',
                                }}
                              >
                                <input
                                  type="text"
                                  value={bullet}
                                  onChange={(e) => {
                                    const updated = [...editableProjects];
                                    const bullets = [...(proj.bullets || [])];
                                    bullets[bidx] = e.target.value;
                                    updated[idx] = { ...proj, bullets };
                                    setEditableProjects(updated);
                                  }}
                                  placeholder={`Bullet ${bidx + 1}`}
                                  style={{ ...inputStyle, flex: 1, marginTop: 0 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...editableProjects];
                                    const bullets = (proj.bullets || []).filter(
                                      (_, i) => i !== bidx,
                                    );
                                    updated[idx] = { ...proj, bullets };
                                    setEditableProjects(updated);
                                  }}
                                  style={{
                                    ...iconButtonStyle,
                                    color: '#ef4444',
                                    flexShrink: 0,
                                  }}
                                  title="Remove bullet"
                                >
                                  <MinusIcon />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjIdx(null);
                            saveSection();
                          }}
                          style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingRight: '5.5rem',
                          }}
                        >
                          <div>
                            <strong>{proj.name}</strong>
                            {proj.context && (
                              <span style={{ color: 'var(--muted)', marginLeft: '0.5rem' }}>
                                ({proj.context})
                              </span>
                            )}
                          </div>
                          {proj.dates && (
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                              {proj.dates}
                            </span>
                          )}
                        </div>
                        {proj.achievements && proj.achievements.length > 0 && (
                          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#22c55e' }}>
                            {proj.achievements.join(' · ')}
                          </p>
                        )}
                        {proj.technologies && proj.technologies.length > 0 && (
                          <p
                            style={{
                              marginTop: '0.5rem',
                              fontSize: '0.85rem',
                              color: 'var(--muted)',
                            }}
                          >
                            <strong>Tech:</strong> {proj.technologies.join(', ')}
                          </p>
                        )}
                        {proj.bullets && proj.bullets.length > 0 && (
                          <ul
                            style={{
                              marginTop: '0.75rem',
                              paddingLeft: '1.25rem',
                              marginBottom: 0,
                            }}
                          >
                            {proj.bullets.map((bullet, bidx) => {
                              const scores = proj.bullet_scores ?? bulletScores.get(`proj-${idx}`);
                              const score = scores?.[bidx];
                              return (
                                <li
                                  key={bidx}
                                  style={{
                                    fontSize: '0.9rem',
                                    marginBottom: '0.5rem',
                                    color: 'var(--text)',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ flex: 1 }}>{bullet}</span>
                                    {score && (
                                      <span
                                        style={{
                                          fontSize: '0.75rem',
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: 4,
                                          background:
                                            score.score >= 4
                                              ? 'rgba(34, 197, 94, 0.15)'
                                              : score.score >= 3
                                                ? 'rgba(234, 179, 8, 0.15)'
                                                : 'rgba(239, 68, 68, 0.15)',
                                          color:
                                            score.score >= 4
                                              ? '#22c55e'
                                              : score.score >= 3
                                                ? '#eab308'
                                                : '#ef4444',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={score.feedback}
                                      >
                                        {score.score}/5
                                      </span>
                                    )}
                                  </div>
                                  {score && (
                                    <p
                                      style={{
                                        margin: '0.25rem 0 0 0',
                                        fontSize: '0.8rem',
                                        color: 'var(--muted)',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      {score.feedback}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Skills */}
          <section style={{ marginBottom: '2rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Skills</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleAnalyzeSkills}
                  disabled={analyzingSkills || !canSaveProfile}
                  style={{
                    ...iconButtonStyle,
                    color: canSaveProfile ? '#22c55e' : 'var(--muted)',
                  }}
                  title="Suggest skills to learn or add"
                >
                  {analyzingSkills ? (
                    <span style={{ fontSize: '12px' }}>...</span>
                  ) : (
                    <AnalyzeIcon size={18} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={addSkill}
                  disabled={saving || !canSaveProfile}
                  style={{
                    ...iconButtonStyle,
                    color: canSaveProfile ? 'var(--accent)' : 'var(--muted)',
                  }}
                  title={canSaveProfile ? 'Add skill' : 'Complete Basic Info first'}
                >
                  <PlusIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editingSkills) {
                      saveSection();
                    }
                    setEditingSkills(!editingSkills);
                  }}
                  style={{
                    ...iconButtonStyle,
                    color: editingSkills ? '#3b82f6' : 'var(--muted)',
                  }}
                  title={editingSkills ? 'Done editing' : 'Edit skills'}
                >
                  <EditIcon />
                </button>
              </div>
            </div>
            <div style={cardStyle}>
              {editableSkills.length === 0 && !editingSkills ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    color: 'var(--muted)',
                    textAlign: 'center',
                    padding: '0.5rem 0',
                  }}
                >
                  No skills yet. Click + to add one.
                </p>
              ) : (
                <>
                  {editingSkills && (
                    <p
                      style={{
                        margin: '0 0 0.75rem 0',
                        fontSize: '0.8rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Click a skill to highlight it as a strength. Hover and click X to remove.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {editableSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        onClick={() => toggleSkillHighlight(skill)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          paddingRight: editingSkills ? '0.5rem' : '0.75rem',
                          background: highlightedSkills.has(skill)
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(59, 130, 246, 0.1)',
                          border: `1px solid ${highlightedSkills.has(skill) ? 'rgba(34, 197, 94, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`,
                          borderRadius: '9999px',
                          fontSize: '0.85rem',
                          color: highlightedSkills.has(skill) ? '#22c55e' : '#3b82f6',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {highlightedSkills.has(skill) && <span>★</span>}
                        {skill}
                        {editingSkills && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSkill(skill);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '0 0.25rem',
                              cursor: 'pointer',
                              color: '#ef4444',
                              opacity: 0.7,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Remove skill"
                          >
                            <XIcon />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {editingSkills && (
                    <div style={{ marginTop: '1rem' }}>
                      <input
                        type="text"
                        placeholder="Add new skill and press Enter"
                        style={inputStyle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value && !editableSkills.includes(value)) {
                              setEditableSkills([...editableSkills, value]);
                              input.value = '';
                            }
                          }
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            {suggestedSkills.length > 0 && (
              <div
                style={{
                  ...cardStyle,
                  marginTop: '1rem',
                  padding: '1rem',
                }}
              >
                <p
                  style={{
                    margin: '0 0 0.75rem 0',
                    fontSize: '0.9rem',
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  You might also consider learning or adding the following skills
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {suggestedSkills.map((skill, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '9999px',
                        fontSize: '0.85rem',
                        color: '#3b82f6',
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Languages */}
          {(editableLanguages.length > 0 || editingLanguages) && (
            <section style={{ marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Languages</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (editingLanguages) {
                      saveSection();
                    }
                    setEditingLanguages(!editingLanguages);
                  }}
                  style={{
                    ...iconButtonStyle,
                    color: editingLanguages ? '#3b82f6' : 'var(--muted)',
                  }}
                  title={editingLanguages ? 'Done editing' : 'Edit languages'}
                >
                  <EditIcon />
                </button>
              </div>
              <div style={cardStyle}>
                {editingLanguages ? (
                  <input
                    type="text"
                    value={editableLanguages.join(', ')}
                    onChange={(e) => {
                      setEditableLanguages(
                        e.target.value
                          .split(',')
                          .map((l) => l.trim())
                          .filter(Boolean),
                      );
                    }}
                    placeholder="Languages (comma separated)"
                    style={inputStyle}
                  />
                ) : (
                  <p style={{ margin: 0 }}>{editableLanguages.join(', ')}</p>
                )}
              </div>
            </section>
          )}

          {/* Certifications */}
          {parsedData.data?.certifications && parsedData.data.certifications.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Certifications</h2>
              <div style={cardStyle}>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {parsedData.data.certifications.map((cert, idx) => (
                    <li key={idx} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {cert}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{label}</span>
      {isLink ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.95rem',
          }}
        >
          {value}
        </a>
      ) : (
        <p style={{ margin: 0, fontSize: '0.95rem' }}>{value}</p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '0.25rem',
  padding: '0.5rem',
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
};

const smallButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0.25rem',
  cursor: 'pointer',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.15s ease',
};
