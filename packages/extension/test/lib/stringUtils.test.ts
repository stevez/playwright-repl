import { describe, it, expect } from 'vitest';
import {
    escapeWithQuotes,
    escapeTemplateString,
    isString,
    toTitleCase,
    toSnakeCase,
    quoteCSSAttributeValue,
    normalizeWhiteSpace,
    cacheNormalizedWhitespaces,
    normalizeEscapedRegexQuotes,
    escapeForTextSelector,
    escapeForAttributeSelector,
    trimString,
    trimStringWithEllipsis,
    escapeRegExp,
    escapeHTMLAttribute,
    escapeHTML,
    longestCommonSubstring,
} from '@/lib/locator/stringUtils';

// ─── escapeWithQuotes ────────────────────────────────────────────────────────

describe('escapeWithQuotes', () => {
    it('wraps text with single quotes by default', () => {
        expect(escapeWithQuotes('hello')).toBe("'hello'");
    });

    it('wraps text with double quotes', () => {
        expect(escapeWithQuotes('hello', '"')).toBe('"hello"');
    });

    it('wraps text with backticks', () => {
        expect(escapeWithQuotes('hello', '`')).toBe('`hello`');
    });

    it('escapes single quotes inside text', () => {
        expect(escapeWithQuotes("it's", "'")).toBe("'it\\'s'");
    });

    it('escapes double quotes inside text', () => {
        expect(escapeWithQuotes('say "hi"', '"')).toBe('"say \\"hi\\""');
    });

    it('handles newlines and tabs via JSON.stringify', () => {
        expect(escapeWithQuotes('a\nb', "'")).toBe("'a\\nb'");
        expect(escapeWithQuotes('a\tb', "'")).toBe("'a\\tb'");
    });

    it('throws for invalid escape char', () => {
        expect(() => escapeWithQuotes('x', '|')).toThrow('Invalid escape char');
    });
});

// ─── escapeTemplateString ────────────────────────────────────────────────────

describe('escapeTemplateString', () => {
    it('escapes backslashes', () => {
        expect(escapeTemplateString('a\\b')).toBe('a\\\\b');
    });

    it('escapes backticks', () => {
        expect(escapeTemplateString('a`b')).toBe('a\\`b');
    });

    it('escapes template interpolation', () => {
        expect(escapeTemplateString('${name}')).toBe('\\${name}');
    });

    it('leaves normal text unchanged', () => {
        expect(escapeTemplateString('hello world')).toBe('hello world');
    });
});

// ─── isString ────────────────────────────────────────────────────────────────

describe('isString', () => {
    it('returns true for string primitives', () => {
        expect(isString('hello')).toBe(true);
    });

    it('returns true for String objects', () => {
        // eslint-disable-next-line no-new-wrappers
        expect(isString(new String('hello'))).toBe(true);
    });

    it('returns false for non-strings', () => {
        expect(isString(42)).toBe(false);
        expect(isString(true)).toBe(false);
        expect(isString(null)).toBe(false);
        expect(isString(undefined)).toBe(false);
        expect(isString({})).toBe(false);
    });
});

// ─── toTitleCase ─────────────────────────────────────────────────────────────

describe('toTitleCase', () => {
    it('uppercases first letter', () => {
        expect(toTitleCase('hello')).toBe('Hello');
    });

    it('handles single character', () => {
        expect(toTitleCase('a')).toBe('A');
    });

    it('handles empty string', () => {
        expect(toTitleCase('')).toBe('');
    });
});

// ─── toSnakeCase ─────────────────────────────────────────────────────────────

describe('toSnakeCase', () => {
    it('converts camelCase', () => {
        expect(toSnakeCase('camelCase')).toBe('camel_case');
    });

    it('converts acronyms', () => {
        expect(toSnakeCase('ignoreHTTPSErrors')).toBe('ignore_https_errors');
    });

    it('handles single word', () => {
        expect(toSnakeCase('word')).toBe('word');
    });
});

// ─── quoteCSSAttributeValue ──────────────────────────────────────────────────

describe('quoteCSSAttributeValue', () => {
    it('wraps value in double quotes', () => {
        expect(quoteCSSAttributeValue('hello')).toBe('"hello"');
    });

    it('escapes embedded double quotes', () => {
        expect(quoteCSSAttributeValue('say "hi"')).toBe('"say \\"hi\\""');
    });

    it('escapes backslashes', () => {
        expect(quoteCSSAttributeValue('a\\b')).toBe('"a\\\\b"');
    });
});

// ─── normalizeWhiteSpace ─────────────────────────────────────────────────────

describe('normalizeWhiteSpace', () => {
    it('collapses multiple spaces', () => {
        expect(normalizeWhiteSpace('a   b')).toBe('a b');
    });

    it('trims leading and trailing whitespace', () => {
        expect(normalizeWhiteSpace('  hello  ')).toBe('hello');
    });

    it('removes zero-width spaces and soft hyphens', () => {
        expect(normalizeWhiteSpace('he\u200bllo')).toBe('hello');
        expect(normalizeWhiteSpace('he\u00adllo')).toBe('hello');
    });

    it('handles newlines and tabs as whitespace', () => {
        expect(normalizeWhiteSpace('a\n\tb')).toBe('a b');
    });
});

// ─── cacheNormalizedWhitespaces ──────────────────────────────────────────────

describe('cacheNormalizedWhitespaces', () => {
    it('enables caching so repeated calls return same result', () => {
        cacheNormalizedWhitespaces();
        const result1 = normalizeWhiteSpace('a   b');
        const result2 = normalizeWhiteSpace('a   b');
        expect(result1).toBe(result2);
        expect(result1).toBe('a b');
    });
});

// ─── normalizeEscapedRegexQuotes ─────────────────────────────────────────────

describe('normalizeEscapedRegexQuotes', () => {
    it('removes unneeded backslash before quote', () => {
        expect(normalizeEscapedRegexQuotes("\\'")).toBe("'");
    });

    it('preserves even number of backslashes + quote', () => {
        expect(normalizeEscapedRegexQuotes("\\\\'")).toBe("\\\\'");
    });
});

// ─── escapeForTextSelector ───────────────────────────────────────────────────

describe('escapeForTextSelector', () => {
    it('wraps string with "i" suffix for non-exact', () => {
        expect(escapeForTextSelector('hello', false)).toBe('"hello"i');
    });

    it('wraps string with "s" suffix for exact', () => {
        expect(escapeForTextSelector('hello', true)).toBe('"hello"s');
    });

    it('passes through RegExp', () => {
        const result = escapeForTextSelector(/test/, false);
        expect(result).toBe('/test/');
    });
});

// ─── escapeForAttributeSelector ──────────────────────────────────────────────

describe('escapeForAttributeSelector', () => {
    it('wraps string with "i" suffix for non-exact', () => {
        expect(escapeForAttributeSelector('val', false)).toBe('"val"i');
    });

    it('wraps string with "s" suffix for exact', () => {
        expect(escapeForAttributeSelector('val', true)).toBe('"val"s');
    });

    it('escapes backslashes and double quotes', () => {
        expect(escapeForAttributeSelector('a\\b"c', false)).toBe('"a\\\\b\\"c"i');
    });

    it('passes through RegExp', () => {
        const result = escapeForAttributeSelector(/test/, false);
        expect(result).toBe('/test/');
    });
});

// ─── trimString ──────────────────────────────────────────────────────────────

describe('trimString', () => {
    it('returns input if within cap', () => {
        expect(trimString('abc', 5)).toBe('abc');
    });

    it('trims at cap boundary with suffix', () => {
        expect(trimString('abcdef', 5, '...')).toBe('ab...');
    });

    it('trims without suffix', () => {
        expect(trimString('abcdef', 3)).toBe('abc');
    });
});

// ─── trimStringWithEllipsis ──────────────────────────────────────────────────

describe('trimStringWithEllipsis', () => {
    it('appends ellipsis when trimming', () => {
        expect(trimStringWithEllipsis('abcdef', 4)).toBe('abc\u2026');
    });

    it('returns input if within cap', () => {
        expect(trimStringWithEllipsis('abc', 5)).toBe('abc');
    });
});

// ─── escapeRegExp ────────────────────────────────────────────────────────────

describe('escapeRegExp', () => {
    it('escapes regex special characters', () => {
        expect(escapeRegExp('a.b*c+d?e^f$g')).toBe('a\\.b\\*c\\+d\\?e\\^f\\$g');
    });

    it('escapes brackets and braces', () => {
        expect(escapeRegExp('[a]{b}(c)|d')).toBe('\\[a\\]\\{b\\}\\(c\\)\\|d');
    });

    it('escapes backslash', () => {
        expect(escapeRegExp('a\\b')).toBe('a\\\\b');
    });
});

// ─── escapeHTMLAttribute ─────────────────────────────────────────────────────

describe('escapeHTMLAttribute', () => {
    it('escapes &, <, >, ", and \'', () => {
        expect(escapeHTMLAttribute('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
    });

    it('leaves normal text unchanged', () => {
        expect(escapeHTMLAttribute('hello')).toBe('hello');
    });
});

// ─── escapeHTML ──────────────────────────────────────────────────────────────

describe('escapeHTML', () => {
    it('escapes & and <', () => {
        expect(escapeHTML('a&b<c')).toBe('a&amp;b&lt;c');
    });

    it('does not escape >, ", or \'', () => {
        expect(escapeHTML('a>b"c\'d')).toBe('a>b"c\'d');
    });
});

// ─── longestCommonSubstring ──────────────────────────────────────────────────

describe('longestCommonSubstring', () => {
    it('finds the longest common substring', () => {
        expect(longestCommonSubstring('abcdef', 'xbcdy')).toBe('bcd');
    });

    it('returns empty string when no common substring', () => {
        expect(longestCommonSubstring('abc', 'xyz')).toBe('');
    });

    it('handles one empty string', () => {
        expect(longestCommonSubstring('', 'abc')).toBe('');
    });

    it('handles identical strings', () => {
        expect(longestCommonSubstring('abc', 'abc')).toBe('abc');
    });

    it('handles both empty strings', () => {
        expect(longestCommonSubstring('', '')).toBe('');
    });
});
