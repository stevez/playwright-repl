// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { tabList, tabNew, tabClose, tabSelect, resolveActivePage } from '../src/command-scripts.js';

// ─── Fake Playwright page/context ───────────────────────────────────────────
// No real browser — just enough surface area for the tab-* functions and
// resolveActivePage to exercise their logic.

function createFakeContext() {
  const pages: any[] = [];
  const context: any = {
    pages: () => pages.slice(),
    newPage: vi.fn(async () => {
      const p = makePage('about:blank', '');
      pages.push(p);
      return p;
    }),
  };
  function makePage(url: string, title: string) {
    let closed = false;
    const page: any = {
      _url: url,
      url: () => page._url,
      title: vi.fn(async () => title),
      goto: vi.fn(async (u: string) => { page._url = u; }),
      bringToFront: vi.fn(async () => {}),
      isClosed: () => closed,
      close: vi.fn(async () => {
        closed = true;
        const idx = pages.indexOf(page);
        if (idx !== -1) pages.splice(idx, 1);
      }),
      context: () => context,
    };
    return page;
  }
  return { context, makePage, pages };
}

describe('tabList', () => {
  it('returns real titles and marks the current page', async () => {
    const { makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'Page A'); pages.push(p0);
    const p1 = makePage('https://b.com', 'Page B'); pages.push(p1);

    const result = await tabList(p0);

    expect(JSON.parse(result)).toEqual([
      { index: 0, title: 'Page A', url: 'https://a.com', current: true },
      { index: 1, title: 'Page B', url: 'https://b.com', current: false },
    ]);
  });

  it('falls back to an empty title when page.title() rejects', async () => {
    const { makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);
    p0.title = vi.fn().mockRejectedValue(new Error('no title'));

    const result = await tabList(p0);

    expect(JSON.parse(result)[0].title).toBe('');
  });
});

describe('tabNew', () => {
  it('switches the active page to the newly opened tab', async () => {
    const { context, makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);

    const result = await tabNew(p0, 'https://new.com');

    expect(result).toBe('Opened new tab: https://new.com');
    const active = resolveActivePage(p0, context);
    expect(active).not.toBe(p0);
    expect(active.url()).toBe('https://new.com');
  });
});

describe('tabSelect', () => {
  it('switches the active page so later commands hit the selected tab', async () => {
    const { context, makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);
    const p1 = makePage('https://b.com', 'B'); pages.push(p1);

    const result = await tabSelect(p0, 1);

    expect(result).toBe('Selected tab 1: https://b.com');
    // This is the crux of #920: eval/snapshot/click after tab-select must
    // resolve to the selected page, not the one the runner started with.
    expect(resolveActivePage(p0, context)).toBe(p1);
  });

  it('throws when the index is out of range', async () => {
    const { makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);

    await expect(tabSelect(p0, 5)).rejects.toThrow('Tab 5 not found');
  });
});

describe('tabClose', () => {
  it('falls back to a remaining page when the current tab is closed', async () => {
    const { context, makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);
    const p1 = makePage('https://b.com', 'B'); pages.push(p1);

    const result = await tabClose(p0);

    expect(result).toBe('Closed: https://a.com');
    expect(pages).toEqual([p1]);
    expect(resolveActivePage(p0, context)).toBe(p1);
  });

  it('leaves the active page unchanged when closing a different tab', async () => {
    const { context, makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);
    const p1 = makePage('https://b.com', 'B'); pages.push(p1);

    await tabClose(p0, 1);

    expect(pages).toEqual([p0]);
    expect(resolveActivePage(p0, context)).toBe(p0);
  });

  it('throws when the tab is not found', async () => {
    const { makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);

    await expect(tabClose(p0, 9)).rejects.toThrow('Tab 9 not found');
  });
});

describe('resolveActivePage', () => {
  it('returns page itself when no tab switch has happened', () => {
    const { context } = createFakeContext();
    const page = {};
    expect(resolveActivePage(page, context)).toBe(page);
  });

  it('skips a stored page that has since been closed, falling back to page', () => {
    const { context, makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);
    const p1 = makePage('https://b.com', 'B'); pages.push(p1);
    context.__pwReplActivePage = p1;

    p1.close();

    expect(resolveActivePage(p0, context)).toBe(p0);
  });

  it('falls back to the last open page in context when stored and passed page are both closed', () => {
    const { context, makePage, pages } = createFakeContext();
    const p0 = makePage('https://a.com', 'A'); pages.push(p0);
    const p1 = makePage('https://b.com', 'B'); pages.push(p1);
    const p2 = makePage('https://c.com', 'C'); pages.push(p2);
    context.__pwReplActivePage = p1;

    p1.close();
    p0.close();

    expect(resolveActivePage(p0, context)).toBe(p2);
  });
});
