/**
 * Resume Parser Agent
 *
 * Extracts structured information from resume PDFs:
 * - Basic info (name, email, phone, location, links) via regex
 * - Education, experience, projects, skills via LLM
 *
 * Uses a hybrid approach: code-first for deterministic extraction,
 * LLM for semantic understanding of unstructured sections.
 */

import { BaseAgent } from '../../shared/base-agent.js';
import type { AgentConfig, AgentContext } from '../../shared/types.js';
import {
  ResumeParserInputSchema,
  ParsedResumeSchema,
  type ResumeParserInput,
  type ParsedResume,
} from './schema.js';
import { extractText } from './extract-text.js';
import { extractBasicInfo } from './parse-basic.js';
import { extractSections, normalizeSkills } from './parse-sections.js';

export class ResumeParserAgent extends BaseAgent<ResumeParserInput, ParsedResume> {
  config: AgentConfig = {
    name: 'ResumeParserAgent',
    description:
      'Extracts structured information from resume PDFs using hybrid code + LLM approach',
    version: '1.0.0',
    timeout: 90000,
    retries: 2,
  };

  inputSchema = ResumeParserInputSchema;
  outputSchema = ParsedResumeSchema;

  protected async run(input: ResumeParserInput, _context: AgentContext): Promise<ParsedResume> {
    const { filePath } = input;

    // Step 1: Extract raw text from PDF (code-only)
    this.info('Extracting text from resume file', { filePath });
    const extracted = await extractText(filePath);
    this.debug(`Extracted ${extracted.numPages} page(s), ${extracted.text.length} chars`);

    // Step 2: Extract basic info using regex (code-only)
    this.info('Extracting basic info via regex patterns');
    const basicInfo = extractBasicInfo(extracted.text);
    this.debug('Basic info extracted', basicInfo);

    // Step 3: Extract sections using LLM
    this.info('Extracting sections via LLM');
    const sections = await extractSections(extracted.text);
    this.debug('Sections extracted', {
      education: sections.education.length,
      experience: sections.experience.length,
      projects: sections.projects.length,
      skills: sections.skills.all.length,
    });

    // Step 4: Normalize and combine results
    const normalizedSkills = normalizeSkills(sections.skills);

    const result: ParsedResume = {
      rawText: extracted.text,
      basicInfo,
      education: sections.education,
      experience: sections.experience,
      projects: sections.projects,
      skills: normalizedSkills,
      certifications: sections.certifications,
      languages: sections.languages,
    };

    this.info('Resume parsing complete');
    return result;
  }
}

export const resumeParserAgent = new ResumeParserAgent();

export * from './schema.js';
export { extractText } from './extract-text.js';
export { extractBasicInfo } from './parse-basic.js';
export { extractSections, normalizeSkills } from './parse-sections.js';
