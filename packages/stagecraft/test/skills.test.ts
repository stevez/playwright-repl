import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverSkills, findSkill } from '../src/skills.js';

// ─── Test fixtures ──────────────────────────────────────────────────────────

function createTmpSkillsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stagecraft-test-'));
  return dir;
}

function writeSkill(skillsDir: string, name: string, frontmatter: string, files?: { pw?: string; js?: string }) {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), frontmatter, 'utf-8');
  if (files?.pw) fs.writeFileSync(path.join(dir, 'script.pw'), files.pw, 'utf-8');
  if (files?.js) fs.writeFileSync(path.join(dir, 'script.js'), files.js, 'utf-8');
  return dir;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('discoverSkills', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpSkillsDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for non-existent directory', () => {
    const result = discoverSkills('/non/existent/path');
    expect(result).toEqual([]);
  });

  it('returns empty array for directory with no skills', () => {
    const result = discoverSkills(tmpDir);
    expect(result).toEqual([]);
  });

  it('discovers a skill with valid SKILL.md', () => {
    writeSkill(tmpDir, 'my-skill', `---
name: my-skill
description: A test skill
category: testing
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe('A test skill');
    expect(skills[0].category).toBe('testing');
  });

  it('parses optional fields (preconditions, output)', () => {
    writeSkill(tmpDir, 'full-skill', `---
name: full-skill
description: Full featured skill
category: automation
preconditions: Must be logged in
output: PDF files
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills[0].preconditions).toBe('Must be logged in');
    expect(skills[0].output).toBe('PDF files');
  });

  it('parses parameters list', () => {
    writeSkill(tmpDir, 'param-skill', `---
name: param-skill
description: Skill with parameters
category: testing
parameters:
  - billing_period: The billing period to check
  - format: Output format (pdf or csv)
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills[0].parameters).toEqual([
      { name: 'billing_period', description: 'The billing period to check' },
      { name: 'format', description: 'Output format (pdf or csv)' },
    ]);
  });

  it('detects .pw and .js files', () => {
    writeSkill(tmpDir, 'file-skill', `---
name: file-skill
description: Skill with files
category: testing
---
`, { pw: 'goto https://example.com', js: 'console.log("hi")' });

    const skills = discoverSkills(tmpDir);
    expect(skills[0].pwFile).toContain('script.pw');
    expect(skills[0].jsFile).toContain('script.js');
  });

  it('sets pwFile/jsFile to undefined when not present', () => {
    writeSkill(tmpDir, 'bare-skill', `---
name: bare-skill
description: No script files
category: testing
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills[0].pwFile).toBeUndefined();
    expect(skills[0].jsFile).toBeUndefined();
  });

  it('skips directories without SKILL.md', () => {
    // Create a directory without SKILL.md
    fs.mkdirSync(path.join(tmpDir, 'no-skill-md'));
    fs.writeFileSync(path.join(tmpDir, 'no-skill-md', 'README.md'), 'Not a skill');

    // Create a valid skill
    writeSkill(tmpDir, 'valid', `---
name: valid
description: Valid skill
category: testing
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('valid');
  });

  it('skips SKILL.md with missing required fields', () => {
    writeSkill(tmpDir, 'incomplete', `---
name: incomplete
description: Missing category
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it('skips SKILL.md without frontmatter', () => {
    writeSkill(tmpDir, 'no-frontmatter', `# Just a heading\nNo frontmatter here.`);

    const skills = discoverSkills(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it('sorts skills by category then name', () => {
    writeSkill(tmpDir, 'b-skill', `---
name: b-skill
description: B
category: z-category
---
`);
    writeSkill(tmpDir, 'a-skill', `---
name: a-skill
description: A
category: a-category
---
`);
    writeSkill(tmpDir, 'c-skill', `---
name: c-skill
description: C
category: a-category
---
`);

    const skills = discoverSkills(tmpDir);
    expect(skills.map(s => s.name)).toEqual(['a-skill', 'c-skill', 'b-skill']);
  });

  it('discovers the real rogers skill', () => {
    const realSkillsDir = path.resolve(import.meta.dirname, '..', 'skills');
    const skills = discoverSkills(realSkillsDir);
    expect(skills.length).toBeGreaterThanOrEqual(1);

    const rogers = findSkill(skills, 'download-rogers-bill');
    expect(rogers).toBeDefined();
    expect(rogers!.category).toBe('tax/bills/telecom');
    expect(rogers!.pwFile).toContain('download-bill.pw');
    expect(rogers!.parameters).toEqual([
      { name: 'billing_period', description: 'billing period label to download (e.g. "January 24, 2026")' },
      { name: 'filename', description: 'output filename for the download (e.g. "rogers-2026-01.pdf")' },
    ]);
  });
});

describe('findSkill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpSkillsDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds a skill by name', () => {
    writeSkill(tmpDir, 'target', `---
name: target-skill
description: Target
category: testing
---
`);

    const skills = discoverSkills(tmpDir);
    const found = findSkill(skills, 'target-skill');
    expect(found).toBeDefined();
    expect(found!.name).toBe('target-skill');
  });

  it('returns undefined for unknown skill', () => {
    const skills = discoverSkills(tmpDir);
    expect(findSkill(skills, 'nonexistent')).toBeUndefined();
  });
});
