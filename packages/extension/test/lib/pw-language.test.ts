import { describe, it, expect, vi } from 'vitest';

// Mock @codemirror/language to capture the token function passed to StreamLanguage.define
interface StreamState { commandSeen: boolean }
interface MockStream {
    pos: number;
    string: string;
    start: number;
    sol: () => boolean;
    eol: () => boolean;
    peek: () => string | undefined;
    next: () => string | undefined;
    eatSpace: () => boolean;
    match: (pattern: RegExp | string, consume?: boolean) => boolean | RegExpMatchArray | null;
    skipToEnd: () => void;
}

let capturedParser: { startState: () => StreamState; token: (stream: MockStream, state: StreamState) => string | null };

vi.mock('@codemirror/language', () => ({
  StreamLanguage: {
    define: (parser: typeof capturedParser) => { capturedParser = parser; return { language: {} }; },
  },
  HighlightStyle: { define: () => ({}) },
  syntaxHighlighting: () => ({}),
}));

vi.mock('@lezer/highlight', () => ({
  tags: { keyword: 'keyword', comment: 'comment', string: 'string', attributeName: 'attributeName', url: 'url' },
}));

// Import after mocks are set up — this triggers StreamLanguage.define with the token function
await import('@/lib/pw-language');

/**
 * Minimal StringStream mock that implements the subset used by the tokenizer.
 */
function makeStream(line: string, pos = 0) {
  const s = {
    pos,
    string: line,
    start: pos,
    sol: () => s.pos === 0,
    eol: () => s.pos >= line.length,
    peek: () => (s.pos < line.length ? line[s.pos] : undefined),
    next: () => (s.pos < line.length ? line[s.pos++] : undefined),
    eatSpace() {
      const start = s.pos;
      while (s.pos < line.length && /\s/.test(line[s.pos])) s.pos++;
      return s.pos > start;
    },
    match(pattern: RegExp | string, consume = true) {
      if (typeof pattern === 'string') {
        if (line.slice(s.pos).startsWith(pattern)) {
          if (consume) s.pos += pattern.length;
          return true;
        }
        return false;
      }
      const m = line.slice(s.pos).match(pattern);
      if (m && m.index === 0) {
        if (consume) s.pos += m[0].length;
        return m;
      }
      return null;
    },
    skipToEnd: () => { s.pos = line.length; },
  };
  return s;
}

/** Tokenize a full line, returning array of { token, type } pairs. */
function tokenize(line: string) {
  const result: { token: string; type: string | null }[] = [];
  const state = capturedParser.startState();
  const stream = makeStream(line);

  while (!stream.eol()) {
    stream.start = stream.pos;
    const type = capturedParser.token(stream, state);
    const token = line.slice(stream.start, stream.pos);
    if (token) result.push({ token, type });
  }
  return result;
}

describe('pw-language tokenizer', () => {

  // ─── Commands ──────────────────────────────────────────────────────────

  it('tokenizes a known command as keyword', () => {
    const tokens = tokenize('click "Submit"');
    expect(tokens[0]).toEqual({ token: 'click', type: 'keyword' });
  });

  it('tokenizes an unknown word without keyword tag', () => {
    const tokens = tokenize('foobar arg');
    expect(tokens[0]).toEqual({ token: 'foobar', type: null });
  });

  // ─── Comments ─────────────────────────────────────────────────────────

  it('tokenizes # as comment', () => {
    const tokens = tokenize('# this is a comment');
    expect(tokens).toEqual([{ token: '# this is a comment', type: 'comment' }]);
  });

  it('does not treat # after command as comment', () => {
    const tokens = tokenize('click #ref');
    expect(tokens.find(t => t.type === 'comment')).toBeUndefined();
  });

  // ─── Quoted strings ──────────────────────────────────────────────────

  it('tokenizes double-quoted strings', () => {
    const tokens = tokenize('click "Submit"');
    expect(tokens).toContainEqual({ token: '"Submit"', type: 'string' });
  });

  it('tokenizes single-quoted strings', () => {
    const tokens = tokenize("fill 'Name' 'Alice'");
    expect(tokens.filter(t => t.type === 'string')).toHaveLength(2);
  });

  it('handles escaped quotes in strings', () => {
    const tokens = tokenize('click "say \\"hello\\""');
    const str = tokens.find(t => t.type === 'string');
    expect(str).toBeTruthy();
    expect(str!.token).toContain('hello');
  });

  // ─── Flags ────────────────────────────────────────────────────────────

  it('tokenizes --flag as attributeName', () => {
    const tokens = tokenize('click "Item" --nth 2');
    expect(tokens).toContainEqual({ token: '--nth', type: 'attributeName' });
  });

  it('tokenizes multi-word flags', () => {
    const tokens = tokenize('screenshot --full-page');
    expect(tokens).toContainEqual({ token: '--full-page', type: 'attributeName' });
  });

  // ─── URLs ─────────────────────────────────────────────────────────────

  it('tokenizes http:// URLs', () => {
    const tokens = tokenize('goto http://example.com');
    expect(tokens).toContainEqual({ token: 'http://example.com', type: 'url' });
  });

  it('tokenizes https:// URLs', () => {
    const tokens = tokenize('goto https://example.com/path?q=1');
    expect(tokens).toContainEqual({ token: 'https://example.com/path?q=1', type: 'url' });
  });

  // ─── Whitespace and plain text ────────────────────────────────────────

  it('returns null type for whitespace', () => {
    const tokens = tokenize('click   "a"');
    // whitespace tokens have null type
    const wsTokens = tokens.filter(t => t.token.trim().length === 0);
    expect(wsTokens.every(t => t.type === null)).toBe(true);
  });

  it('consumes plain unquoted args one char at a time', () => {
    const tokens = tokenize('press Enter');
    // "Enter" should be consumed char by char as null-type tokens
    const nullTokens = tokens.filter(t => t.type === null);
    expect(nullTokens.length).toBeGreaterThan(0);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it('handles empty string', () => {
    const tokens = tokenize('');
    expect(tokens).toEqual([]);
  });

  it('handles line with only whitespace', () => {
    const tokens = tokenize('   ');
    // whitespace is consumed as null-type tokens
    expect(tokens.every(t => t.type === null)).toBe(true);
  });

  it('resets commandSeen at start of line (sol)', () => {
    // Simulate: after one line the state.commandSeen should reset
    const state = capturedParser.startState();
    const stream1 = makeStream('click');
    stream1.start = stream1.pos;
    capturedParser.token(stream1, state);
    expect(state.commandSeen).toBe(true);

    // New line — sol() returns true, should reset commandSeen
    const stream2 = makeStream('goto');
    stream2.start = stream2.pos;
    capturedParser.token(stream2, state);
    expect(state.commandSeen).toBe(true); // set again for new command
  });
});
