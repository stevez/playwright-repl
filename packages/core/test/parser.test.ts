// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { parseInput, resolveArgs, ALIASES, ALL_COMMANDS, booleanOptions } from '../src/parser.js';

describe('parseInput', () => {
  it('parses a basic command', () => {
    const args = parseInput('click e5');
    expect(args._).toEqual(['click', 'e5']);
  });

  it('returns null for empty input', () => {
    expect(parseInput('')).toBeNull();
    expect(parseInput('   ')).toBeNull();
  });

  it('resolves single-letter aliases', () => {
    const args = parseInput('c e5');
    expect(args._[0]).toBe('click');
    expect(args._[1]).toBe('e5');
  });

  it('resolves multi-letter aliases', () => {
    expect(parseInput('snap')._[0]).toBe('snapshot');
    expect(parseInput('back')._[0]).toBe('go-back');
    expect(parseInput('fwd')._[0]).toBe('go-forward');
  });

  it('handles quoted strings with single quotes', () => {
    const args = parseInput("fill e7 'hello world'");
    expect(args._).toEqual(['fill', 'e7', 'hello world']);
  });

  it('handles quoted strings with double quotes', () => {
    const args = parseInput('fill e7 "hello world"');
    expect(args._).toEqual(['fill', 'e7', 'hello world']);
  });

  it('parses boolean options', () => {
    const args = parseInput('screenshot --fullPage');
    expect(args.fullPage).toBe(true);
    expect(args._[0]).toBe('screenshot');
  });

  it('strips false-valued booleans not explicitly passed', () => {
    const args = parseInput('click e5');
    expect(args).not.toHaveProperty('headed');
    expect(args).not.toHaveProperty('fullPage');
    expect(args).not.toHaveProperty('persistent');
  });

  it('keeps explicit --no- booleans', () => {
    const args = parseInput('open --no-headed');
    expect(args.headed).toBe(false);
  });

  it('coerces all args to strings', () => {
    const args = parseInput('tab-select 3');
    expect(args._[1]).toBe('3');
    expect(typeof args._[1]).toBe('string');
  });

  it('parses string options', () => {
    const args = parseInput('screenshot --filename test.png');
    expect(args._[0]).toBe('screenshot');
    expect(args.filename).toBe('test.png');
  });

  it('lowercases command for alias lookup', () => {
    const args = parseInput('C e5');
    expect(args._[0]).toBe('click');
  });

  it('handles command with no arguments', () => {
    const args = parseInput('snapshot');
    expect(args._).toEqual(['snapshot']);
  });

  it('preserves run-code body as single raw string', () => {
    const args = parseInput('run-code async (page) => await page.url()');
    expect(args._).toEqual(['run-code', 'async (page) => await page.url()']);
  });

  it('preserves eval expression as single raw string', () => {
    const args = parseInput('eval document.querySelectorAll("a").length');
    expect(args._).toEqual(['eval', 'document.querySelectorAll("a").length']);
  });

  it('resolves eval alias and preserves raw expression', () => {
    const args = parseInput('e document.title');
    expect(args._).toEqual(['eval', 'document.title']);
  });

  it('handles run-code with no body', () => {
    const args = parseInput('run-code');
    expect(args._).toEqual(['run-code']);
  });

  it('preserves braces and special chars in run-code', () => {
    const args = parseInput('run-code async (page) => { const t = await page.title(); return t; }');
    expect(args._[1]).toContain('{ const t = await page.title()');
  });
});

// ─── CSS locator pseudo-classes (Playwright non-standard CSS) ───────────────

describe('CSS locator pseudo-classes', () => {
  it('preserves quotes inside :has-text() — double quotes', () => {
    const args = parseInput('highlight div:has-text("RFCP")');
    expect(args._).toEqual(['highlight', 'div:has-text("RFCP")']);
  });

  it('preserves quotes inside :has-text() — single quotes', () => {
    const args = parseInput("highlight div:has-text('RFCP')");
    expect(args._).toEqual(['highlight', "div:has-text('RFCP')"]);
  });

  it('preserves spaces inside :has-text()', () => {
    const args = parseInput('highlight div:has-text("Hello World")');
    expect(args._).toEqual(['highlight', 'div:has-text("Hello World")']);
  });

  it('preserves quotes inside :text()', () => {
    const args = parseInput('highlight button:text("Submit")');
    expect(args._).toEqual(['highlight', 'button:text("Submit")']);
  });

  it('preserves quotes inside :text-is()', () => {
    const args = parseInput('highlight span:text-is("Exact")');
    expect(args._).toEqual(['highlight', 'span:text-is("Exact")']);
  });

  it('preserves quotes inside :text-matches() with regex', () => {
    const args = parseInput('highlight div:text-matches("^RFCP$")');
    expect(args._).toEqual(['highlight', 'div:text-matches("^RFCP$")']);
  });

  it('handles nested parens in :has()', () => {
    const args = parseInput('highlight div:has(button:has-text("OK"))');
    expect(args._).toEqual(['highlight', 'div:has(button:has-text("OK"))']);
  });

  it('still tokenizes normally outside parens', () => {
    const args = parseInput('click "Submit" --force');
    expect(args._).toEqual(['click', 'Submit']);
    expect(args.force).toBe(true);
  });

  it('handles CSS locator followed by normal flag', () => {
    const args = parseInput('highlight div:has-text("RFCP") --clear');
    expect(args._).toEqual(['highlight', 'div:has-text("RFCP")']);
    expect(args.clear).toBe(true);
  });
});

describe('ALIASES', () => {
  it('maps most aliases to known commands', () => {
    // verify-* aliases map to commands handled as knownExtras in repl.ts,
    // not in the COMMANDS vocabulary — that's intentional.
    const extras = ['highlight', 'verify', 'verify-text', 'verify-element', 'verify-value', 'verify-list'];
    for (const [alias, cmd] of Object.entries(ALIASES)) {
      if (extras.includes(cmd)) continue;
      expect(ALL_COMMANDS, `alias "${alias}" → "${cmd}"`).toContain(cmd);
    }
  });
});

describe('--in option', () => {
  it('parses --in role text into in-role and in-text', () => {
    const args = parseInput('click button "Submit" --in dialog "Settings"');
    expect(args['in-role']).toBe('dialog');
    expect(args['in-text']).toBe('Settings');
    expect(args._).toEqual(['click', 'button', 'Submit']);
  });

  it('parses --in with --nth', () => {
    const args = parseInput('click tab "npm" --nth 0 --in article "Getting Started"');
    expect(args['in-role']).toBe('article');
    expect(args['in-text']).toBe('Getting Started');
    expect(args.nth).toBe('0');
  });

  it('does not parse --in when fewer than 2 values follow', () => {
    const args = parseInput('click button "Submit" --in dialog');
    // minimist treats --in as a string option with value "dialog"
    expect(args.in).toBe('dialog');
    expect(args).not.toHaveProperty('in-role');
  });

  it('parses --in with text-only (no role) into in-text', () => {
    const args = parseInput('click radio "Nein" --in "Rechnungsadresse abweichend?"');
    expect(args['in-text']).toBe('Rechnungsadresse abweichend?');
    expect(args).not.toHaveProperty('in-role');
    expect(args._).toEqual(['click', 'radio', 'Nein']);
  });
});

describe('--frame flag', () => {
  it('parses --frame as a string option', () => {
    const args = parseInput('click "Bis 45 km/h" --frame "#oevd-iframe"');
    expect(args.frame).toBe('#oevd-iframe');
    expect(args._).toEqual(['click', 'Bis 45 km/h']);
  });

  it('wraps run-code with frame resolution in resolveArgs', () => {
    const args = parseInput('click "Submit" --frame "#myframe"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('page.locator("#myframe").contentFrame()');
    expect(resolved.frame).toBeUndefined();
  });

  it('does not wrap when --frame is absent', () => {
    const args = parseInput('click "Submit"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).not.toContain('contentFrame');
  });
});

describe('--in with text locators (resolveArgs)', () => {
  it('scopes text-based click with --in', () => {
    const args = parseInput('click "Bis 45 km/h" --in "Moped, Roller"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('actionByText');
    expect(resolved._[1]).toContain('"Moped, Roller"');
    expect(resolved._[1]).toContain('"Bis 45 km/h"');
    // Should use scoping logic (role-based fallback + data-pw-in)
    expect(resolved._[1]).toContain('getByRole');
    expect(resolved._[1]).toContain('data-pw-in');
  });

  it('scopes text-based check with --in', () => {
    const args = parseInput('check "Newsletter" --in "Preferences"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('checkByText');
    expect(resolved._[1]).toContain('"Preferences"');
  });

  it('scopes text-based fill with --in', () => {
    const args = parseInput('fill "Email" user@example.com --in "Contact"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('fillByText');
    expect(resolved._[1]).toContain('"Contact"');
    expect(resolved._[1]).toContain('"Email"');
  });

  it('does not scope text-based click without --in', () => {
    const args = parseInput('click "Submit"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('actionByText');
    expect(resolved._[1]).not.toContain('data-pw-in');
  });

  it('DOM fallback tries exact first for --in text (preserves existing behavior)', () => {
    const args = parseInput('click "Nein" --in "Rechnungsadresse abweichend?"');
    const resolved = resolveArgs(args);
    const code = resolved._[1];
    // When --in text matches exactly, exact should be tried first
    expect(code).toContain('getByText("Rechnungsadresse abweichend?", { exact: true })');
  });

  it('DOM fallback falls back to substring when exact finds nothing (#734)', () => {
    const args = parseInput('click "Bis 45 km/h" --in "Moped, Roller"');
    const resolved = resolveArgs(args);
    const code = resolved._[1];
    // Should try exact first, then fall back to substring
    // so "Moped, Roller" still matches "Moped, Roller, Mokick..."
    expect(code).toContain('getByText("Moped, Roller", { exact: true })');
    expect(code).toContain('__anchor.count()');
    expect(code).toContain('__anchor = page.getByText("Moped, Roller")');
  });
});

describe('verify css subcommand (#787)', () => {
  it('verify-visible css resolves to verifyCssVisible', () => {
    const args = parseInput('verify-visible css "#LoginName"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyCssVisible');
    expect(resolved._[1]).toContain('#LoginName');
  });

  it('verify-element css resolves to verifyCssElement', () => {
    const args = parseInput('verify-element css ".my-btn"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyCssElement');
    expect(resolved._[1]).toContain('.my-btn');
  });

  it('verify-no-element css resolves to verifyCssNoElement', () => {
    const args = parseInput('verify-no-element css ".deleted"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyCssNoElement');
  });

  it('verify-value css resolves to verifyCssValue', () => {
    const args = parseInput('verify-value css "#LoginName" "testuser"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyCssValue');
    expect(resolved._[1]).toContain('#LoginName');
    expect(resolved._[1]).toContain('testuser');
  });

  it('verify visible css (unified) resolves to verifyCssVisible', () => {
    const args = parseInput('verify visible css "#LoginName"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyCssVisible');
  });

  it('verify element css (unified) resolves to verifyCssElement', () => {
    const args = parseInput('verify element css ".my-btn"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyCssElement');
  });

  it('verify-visible without css still uses role-based', () => {
    const args = parseInput('verify-visible button "Submit"');
    const resolved = resolveArgs(args);
    expect(resolved._[0]).toBe('run-code');
    expect(resolved._[1]).toContain('verifyVisible');
    expect(resolved._[1]).not.toContain('verifyCssVisible');
  });
});

describe('booleanOptions', () => {
  it('includes expected options', () => {
    expect(booleanOptions.has('headed')).toBe(true);
    expect(booleanOptions.has('fullPage')).toBe(true);
    expect(booleanOptions.has('persistent')).toBe(true);
  });
});
