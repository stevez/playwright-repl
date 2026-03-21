import { describe, it, expect } from 'vitest';
import { parseSnapshot, refToLocator } from '../src/snapshot-parser.js';
import type { SnapshotNode } from '../src/snapshot-parser.js';

const SAMPLE_YAML = `\
- document [ref=e1]:
  - heading "Welcome" [level=2] [ref=e2]
  - navigation "Main":
    - link "Home" [ref=e3]
    - link "About" [ref=e4]
  - main:
    - textbox "Email" [ref=e5]
    - button "Sign in" [ref=e6]
    - img [ref=e7]
    - checkbox "Remember me" [checked] [ref=e8]
`;

describe('parseSnapshot', () => {
  it('parses a YAML snapshot into a tree', () => {
    const root = parseSnapshot(SAMPLE_YAML);
    expect(root).not.toBeNull();
    expect(root!.text).toBe('document');
    expect(root!.ref).toBe('e1');
    expect(root!.children.length).toBeGreaterThan(0);
  });

  it('returns null for non-array YAML', () => {
    expect(parseSnapshot('key: value')).toBeNull();
  });

  it('returns null for empty YAML', () => {
    expect(parseSnapshot('')).toBeNull();
  });

  it('strips ref from text', () => {
    const root = parseSnapshot(SAMPLE_YAML);
    const heading = root!.children[0];
    expect(heading.text).toBe('heading "Welcome" [level=2]');
    expect(heading.ref).toBe('e2');
  });
});

describe('refToLocator', () => {
  it('converts a button ref to js and pw locators', () => {
    const result = refToLocator(SAMPLE_YAML, 'e6');
    expect(result).toEqual({
      js: "page.getByRole('button', { name: 'Sign in', exact: true })",
      pw: 'button "Sign in"',
    });
  });

  it('converts a link ref', () => {
    const result = refToLocator(SAMPLE_YAML, 'e3');
    expect(result).toEqual({
      js: "page.getByRole('link', { name: 'Home', exact: true })",
      pw: 'link "Home"',
    });
  });

  it('converts a heading with attributes', () => {
    const result = refToLocator(SAMPLE_YAML, 'e2');
    expect(result).toEqual({
      js: "page.getByRole('heading', { name: 'Welcome', exact: true })",
      pw: 'heading "Welcome"',
    });
  });

  it('converts an element with no name', () => {
    const result = refToLocator(SAMPLE_YAML, 'e7');
    expect(result).toEqual({
      js: "page.getByRole('img')",
      pw: 'img',
    });
  });

  it('converts a textbox ref', () => {
    const result = refToLocator(SAMPLE_YAML, 'e5');
    expect(result).toEqual({
      js: "page.getByRole('textbox', { name: 'Email', exact: true })",
      pw: 'textbox "Email"',
    });
  });

  it('converts a checkbox with attributes', () => {
    const result = refToLocator(SAMPLE_YAML, 'e8');
    expect(result).toEqual({
      js: "page.getByRole('checkbox', { name: 'Remember me', exact: true })",
      pw: 'checkbox "Remember me"',
    });
  });

  it('returns null for unknown ref', () => {
    expect(refToLocator(SAMPLE_YAML, 'e99')).toBeNull();
  });

  it('returns null for invalid YAML', () => {
    expect(refToLocator('not: valid: yaml: []', 'e1')).toBeNull();
  });

  it('escapes single quotes in js name', () => {
    const yaml = `- button "It's done" [ref=e1]`;
    const result = refToLocator(yaml, 'e1');
    expect(result).toEqual({
      js: "page.getByRole('button', { name: 'It\\'s done', exact: true })",
      pw: "button \"It's done\"",
    });
  });

  it('adds nth when duplicate role+name exists', () => {
    const yaml = `\
- document [ref=e1]:
  - button "Submit" [ref=e2]
  - button "Submit" [ref=e3]`;
    expect(refToLocator(yaml, 'e2')).toEqual({
      js: "page.getByRole('button', { name: 'Submit', exact: true }).nth(0)",
      pw: 'button "Submit" --nth 0',
    });
    expect(refToLocator(yaml, 'e3')).toEqual({
      js: "page.getByRole('button', { name: 'Submit', exact: true }).nth(1)",
      pw: 'button "Submit" --nth 1',
    });
  });

  it('adds nth when duplicate no-name elements exist', () => {
    const yaml = `\
- document [ref=e1]:
  - img [ref=e2]
  - img [ref=e3]
  - img [ref=e4]`;
    expect(refToLocator(yaml, 'e3')).toEqual({
      js: "page.getByRole('img').nth(1)",
      pw: 'img --nth 1',
    });
  });

  it('does not add nth when role+name is unique', () => {
    const result = refToLocator(SAMPLE_YAML, 'e6');
    expect(result!.js).not.toContain('.nth');
    expect(result!.pw).not.toContain('--nth');
  });
});

// ─── Full-page snapshot: list all ref → locator mappings ─────────────────────

function collectRefs(node: SnapshotNode): string[] {
  const refs: string[] = [];
  if (node.ref) refs.push(node.ref);
  for (const child of node.children) refs.push(...collectRefs(child));
  return refs;
}

describe('refToLocator — full page', () => {
  // Paste a real snapshot here to inspect all locator mappings
  const FULL_PAGE_YAML = `\
- document [ref=e1]:
  - banner:
    - navigation "Main":
      - link "Home" [ref=e10]
      - link "Products" [ref=e11]
      - link "About" [ref=e12]
    - search:
      - textbox "Search" [ref=e20]
      - button "Search" [ref=e21]
  - main:
    - heading "Welcome to our site" [level=1] [ref=e30]
    - paragraph:
      - text "Browse our collection"
    - list:
      - listitem [ref=e40]:
        - link "Widget A" [ref=e41]
        - text "$9.99"
      - listitem [ref=e42]:
        - link "Widget B" [ref=e43]
        - text "$19.99"
      - listitem [ref=e44]:
        - link "Widget C" [ref=e45]
        - text "$29.99"
    - button "Load more" [ref=e50]
  - contentinfo:
    - link "Privacy" [ref=e60]
    - link "Terms" [ref=e61]`;

  it('handles textbox with value suffix', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "Search" [ref=e5]: hello`;
    const result = refToLocator(yaml, 'e5');
    expect(result).toEqual({
      js: "page.getByRole('textbox', { name: 'Search', exact: true })",
      pw: 'textbox "Search"',
    });
  });

  it('handles textbox with empty value suffix', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "What needs to be done?" [ref=e8]: dddd`;
    const result = refToLocator(yaml, 'e8');
    expect(result).toEqual({
      js: "page.getByRole('textbox', { name: 'What needs to be done?', exact: true })",
      pw: 'textbox "What needs to be done?"',
    });
  });

  it('lists all ref → locator mappings', () => {
    const root = parseSnapshot(FULL_PAGE_YAML);
    expect(root).not.toBeNull();
    const refs = collectRefs(root!);
    const mappings = refs.map(ref => {
      const loc = refToLocator(FULL_PAGE_YAML, ref);
      return { ref, js: loc?.js ?? 'null', pw: loc?.pw ?? 'null' };
    });

    // Print for visual inspection
    console.table(mappings);

    // Every ref should produce a locator
    for (const m of mappings) {
      expect(m.js).not.toBe('null');
      expect(m.pw).not.toBe('null');
    }
  });
});
