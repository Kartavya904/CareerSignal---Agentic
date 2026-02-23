import { describe, it, expect } from 'vitest';
import { extractBasicInfo } from '@careersignal/agents';
import {
  extractEmail,
  extractPhone,
  extractLocation,
  extractLinkedIn,
  extractGitHub,
  extractPortfolio,
  extractName,
} from '../../agents/src/profile/resume-parser/parse-basic';

const SAMPLE_RESUME_TEXT = `JOHN DOE
Available for immediate start
Cincinnati, OH | (513) 555-1234 | john.doe@email.com
linkedin.com/in/johndoe | github.com/johndoe | johndoe.dev

EDUCATION
University of Cincinnati
Bachelor of Science in Computer Science | GPA: 3.8/4.0 | Aug 2018 - May 2022
Relevant Coursework: Data Structures, Algorithms, Machine Learning

EXPERIENCE
Software Engineer | Acme Corp | Cincinnati, OH | Jun 2022 - Present
- Built microservices handling 10M+ requests/day
- Led migration from monolith to microservices architecture

Junior Developer | TechStartup Inc | Remote | Jan 2021 - May 2022
- Developed React frontend with TypeScript
- Implemented CI/CD pipeline with GitHub Actions

SKILLS
Languages: Python, TypeScript, Java, Go
Frameworks: React, Next.js, FastAPI, Spring Boot
Tools: Docker, Kubernetes, AWS, PostgreSQL`;

describe('resume-parser — parse-basic (code-only)', () => {
  describe('extractEmail', () => {
    it('extracts email address', () => {
      expect(extractEmail(SAMPLE_RESUME_TEXT)).toBe('john.doe@email.com');
    });

    it('returns null for text without email', () => {
      expect(extractEmail('No email here')).toBeNull();
    });

    it('extracts first email when multiple present', () => {
      const text = 'Contact: first@test.com or second@test.com';
      expect(extractEmail(text)).toBe('first@test.com');
    });
  });

  describe('extractPhone', () => {
    it('extracts phone number in (XXX) XXX-XXXX format', () => {
      expect(extractPhone(SAMPLE_RESUME_TEXT)).toBeDefined();
    });

    it('extracts phone with parentheses', () => {
      expect(extractPhone('Call (555) 123-4567')).toBe('(555) 123-4567');
    });

    it('extracts phone without parentheses', () => {
      expect(extractPhone('Call 555-123-4567')).toBe('555-123-4567');
    });

    it('returns null for text without phone', () => {
      expect(extractPhone('No phone here')).toBeNull();
    });
  });

  describe('extractLocation', () => {
    it('extracts City, ST format', () => {
      expect(extractLocation(SAMPLE_RESUME_TEXT)).toBe('Cincinnati, OH');
    });

    it('extracts multi-word city', () => {
      expect(extractLocation('San Francisco, CA')).toBe('San Francisco, CA');
    });

    it('returns null for text without location', () => {
      expect(extractLocation('No location')).toBeNull();
    });
  });

  describe('extractLinkedIn', () => {
    it('extracts LinkedIn URL', () => {
      const result = extractLinkedIn(SAMPLE_RESUME_TEXT);
      expect(result).toBeDefined();
      expect(result).toContain('linkedin.com/in/johndoe');
    });

    it('adds https:// prefix when missing', () => {
      const result = extractLinkedIn('linkedin.com/in/test');
      expect(result).toBe('https://linkedin.com/in/test');
    });

    it('returns null when no LinkedIn URL', () => {
      expect(extractLinkedIn('No LinkedIn')).toBeNull();
    });
  });

  describe('extractGitHub', () => {
    it('extracts GitHub URL', () => {
      const result = extractGitHub(SAMPLE_RESUME_TEXT);
      expect(result).toBeDefined();
      expect(result).toContain('github.com/johndoe');
    });

    it('adds https:// prefix when missing', () => {
      const result = extractGitHub('github.com/testuser');
      expect(result).toBe('https://github.com/testuser');
    });

    it('returns null when no GitHub URL', () => {
      expect(extractGitHub('No GitHub')).toBeNull();
    });
  });

  describe('extractPortfolio', () => {
    it('extracts portfolio URL', () => {
      const result = extractPortfolio(SAMPLE_RESUME_TEXT);
      expect(result).toBeDefined();
      expect(result).toContain('johndoe.dev');
    });

    it('skips LinkedIn and GitHub URLs', () => {
      const text = 'linkedin.com/in/test github.com/test mysite.com';
      const result = extractPortfolio(text);
      expect(result).toContain('mysite.com');
    });

    it('returns null when no portfolio URL', () => {
      expect(extractPortfolio('No portfolio')).toBeNull();
    });
  });

  describe('extractName', () => {
    it('extracts ALL CAPS name from resume header', () => {
      expect(extractName(SAMPLE_RESUME_TEXT)).toBe('John Doe');
    });

    it('title-cases the extracted name', () => {
      const result = extractName('JANE SMITH\nemail@test.com');
      expect(result).toBe('Jane Smith');
    });

    it('returns "Unknown" for empty text', () => {
      expect(extractName('')).toBe('Unknown');
    });

    it('skips availability lines', () => {
      const text = 'Available for immediate start\nJOHN DOE\nemail@test.com';
      expect(extractName(text)).toBe('John Doe');
    });
  });

  describe('extractBasicInfo', () => {
    it('returns all fields as a structured object', () => {
      const info = extractBasicInfo(SAMPLE_RESUME_TEXT);
      expect(info.name).toBe('John Doe');
      expect(info.email).toBe('john.doe@email.com');
      expect(info.phone).toBeDefined();
      expect(info.location).toBe('Cincinnati, OH');
      expect(info.linkedinUrl).toContain('linkedin.com/in/johndoe');
      expect(info.githubUrl).toContain('github.com/johndoe');
    });

    it('handles text with minimal info', () => {
      const info = extractBasicInfo('ALICE WONDER\nalice@test.com');
      expect(info.name).toBe('Alice Wonder');
      expect(info.email).toBe('alice@test.com');
      expect(info.phone).toBeNull();
      expect(info.location).toBeNull();
    });
  });
});
