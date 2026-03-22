import { describe, it, expect } from 'vitest';
import { parseSnapshot, refToLocator, locatorToRef } from '@/lib/snapshot-parser';

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
`;

describe('parseSnapshot — scalar values inline, refs in text', () => {
  it('shows value inline and keeps ref in text', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "Search" [ref=e5]: hello`;
    const root = parseSnapshot(yaml);
    const textbox = root!.children[0];
    expect(textbox.text).toBe('textbox "Search" [ref=e5]: hello');
    expect(textbox.ref).toBe('e5');
    expect(textbox.value).toBe('hello');
    expect(textbox.children).toEqual([]);
  });

  it('shows numeric value inline', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "Amount" [ref=e2]: 42`;
    const root = parseSnapshot(yaml);
    expect(root!.children[0].text).toBe('textbox "Amount" [ref=e2]: 42');
    expect(root!.children[0].value).toBe('42');
    expect(root!.children[0].children).toEqual([]);
  });

  it('shows /url value inline', () => {
    const yaml = `\
- document [ref=e1]:
  - link "Get started" [ref=e2]:
    - /url: /docs/intro`;
    const root = parseSnapshot(yaml);
    const link = root!.children[0];
    expect(link.text).toBe('link "Get started" [ref=e2]');
    expect(link.children.length).toBe(1);
    const urlNode = link.children[0];
    expect(urlNode.text).toBe('/url: /docs/intro');
    expect(urlNode.value).toBe('/docs/intro');
    expect(urlNode.children).toEqual([]);
  });

  it('keeps ref in text for leaf nodes', () => {
    const yaml = `\
- document [ref=e1]:
  - navigation "Main":
    - link "Home" [ref=e3]`;
    const root = parseSnapshot(yaml);
    const nav = root!.children[0];
    expect(nav.children.length).toBe(1);
    expect(nav.children[0].text).toBe('link "Home" [ref=e3]');
  });
});

describe('refToLocator', () => {
  it('converts a button ref', () => {
    expect(refToLocator(SAMPLE_YAML, 'e6')).toEqual({
      js: "page.getByRole('button', { name: 'Sign in', exact: true })",
      pw: 'button "Sign in"',
    });
  });

  it('converts a textbox ref', () => {
    expect(refToLocator(SAMPLE_YAML, 'e5')).toEqual({
      js: "page.getByRole('textbox', { name: 'Email', exact: true })",
      pw: 'textbox "Email"',
    });
  });

  it('converts element with no name', () => {
    expect(refToLocator(SAMPLE_YAML, 'e7')).toEqual({
      js: "page.getByRole('img')",
      pw: 'img',
    });
  });

  it('returns null for unknown ref', () => {
    expect(refToLocator(SAMPLE_YAML, 'e99')).toBeNull();
  });

  it('handles textbox with value suffix', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "Search" [ref=e5]: hello`;
    expect(refToLocator(yaml, 'e5')).toEqual({
      js: "page.getByRole('textbox', { name: 'Search', exact: true })",
      pw: 'textbox "Search"',
    });
  });

  it('handles textbox with long value suffix', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "What needs to be done?" [ref=e8]: dddd`;
    expect(refToLocator(yaml, 'e8')).toEqual({
      js: "page.getByRole('textbox', { name: 'What needs to be done?', exact: true })",
      pw: 'textbox "What needs to be done?"',
    });
  });

  it('adds nth for duplicate role+name', () => {
    const yaml = `\
- document [ref=e1]:
  - button "Submit" [ref=e2]
  - button "Submit" [ref=e3]`;
    expect(refToLocator(yaml, 'e2')!.js).toContain('.nth(0)');
    expect(refToLocator(yaml, 'e3')!.js).toContain('.nth(1)');
  });
});

describe('locatorToRef', () => {
  it('finds ref from getByRole with name', () => {
    expect(locatorToRef(SAMPLE_YAML, "getByRole('button', { name: 'Sign in' })")).toBe('e6');
  });

  it('finds ref from getByRole without name', () => {
    expect(locatorToRef(SAMPLE_YAML, "getByRole('img')")).toBe('e7');
  });

  it('returns null for non-getByRole locator', () => {
    expect(locatorToRef(SAMPLE_YAML, "getByText('Sign in')")).toBeNull();
  });

  it('returns null for unknown role+name', () => {
    expect(locatorToRef(SAMPLE_YAML, "getByRole('button', { name: 'Delete' })")).toBeNull();
  });

  it('handles nth for duplicate elements', () => {
    const yaml = `\
- document [ref=e1]:
  - button "Submit" [ref=e2]
  - button "Submit" [ref=e3]`;
    expect(locatorToRef(yaml, "getByRole('button', { name: 'Submit' }).nth(0)")).toBe('e2');
    expect(locatorToRef(yaml, "getByRole('button', { name: 'Submit' }).nth(1)")).toBe('e3');
  });

  it('finds ref for textbox with value suffix', () => {
    const yaml = `\
- document [ref=e1]:
  - textbox "Search" [ref=e5]: hello`;
    expect(locatorToRef(yaml, "getByRole('textbox', { name: 'Search' })")).toBe('e5');
  });
});
