// @ts-nocheck — Intentionally untyped so fn.toString() works for inline eval.
/**
 * Pure Playwright page-script functions for command execution.
 *
 * Each function takes (page, ...args) and returns a result string.
 * Used by both the extension (via fn.toString() + eval) and relay (direct call).
 *
 * Chrome-dependent functions (tab-*, console, network, dialog, route)
 * are NOT included — those live in platform-specific extensions.
 */

// ─── Navigation ─────────────────────────────────────────────────────────────

export async function gotoUrl(page, url) {
  await page.goto(url);
  return 'Navigated to ' + url;
}

export async function reloadPage(page) {
  await page.reload();
  return 'Reloaded';
}

export async function goBack(page) {
  await page.goBack();
  return page.url();
}

export async function goForward(page) {
  await page.goForward();
  return page.url();
}

// ─── Timing ─────────────────────────────────────────────────────────────────

export async function waitMs(page, ms) {
  await page.waitForTimeout(ms);
  return 'Waited ' + ms + 'ms';
}

// ─── Page info ──────────────────────────────────────────────────────────────

export async function getTitle(page) {
  return await page.title();
}

export async function getUrl(page) {
  return page.url();
}

// ─── Eval / Run Code ────────────────────────────────────────────────────────

export async function evalCode(page, code) {
  const result = await page.evaluate(code);
  return result !== undefined ? JSON.stringify(result) : 'undefined';
}

export async function runCode(page, code) {
  const AsyncFunction = runCode.constructor;
  const trimmed = code.trim();
  const isFnExpr = /^(async\s*)?\(|^(async\s+)?function\b/.test(trimmed);
  const body = isFnExpr ? `return (${trimmed})(page)` : `return ${trimmed}`;
  const fn = new AsyncFunction('page', body);
  const result = await fn(page);
  return result != null && typeof result !== 'object' ? String(result) : 'Done';
}

// ─── Screenshot / Snapshot / PDF ────────────────────────────────────────────

export async function takeScreenshot(page, fullPage) {
  const data = await page.screenshot({ type: 'jpeg', fullPage: !!fullPage });
  return { __image: data.toString('base64'), mimeType: 'image/jpeg' };
}

export async function takeSnapshot(page) {
  if (typeof page.ariaSnapshot === 'function') {
    return await page.ariaSnapshot({ mode: 'ai' });
  }
  if (typeof page._snapshotForAI === 'function') {
    const result = await page._snapshotForAI();
    return result.full ?? String(result);
  }
  const title = await page.title();
  const url = page.url();
  return 'Title: ' + title + '\nURL: ' + url;
}

export async function takePdf(page) {
  const data = await page.pdf();
  return { __image: data.toString('base64'), mimeType: 'application/pdf' };
}

// ─── Ref-based actions ──────────────────────────────────────────────────────

export async function refAction(page, ref, action, value) {
  const loc = page.locator('aria-ref=' + ref);
  if (await loc.count() === 0) throw new Error('Element ' + ref + ' not found. Run snapshot first.');
  if (value !== undefined) await loc[action](value);
  else await loc[action]();
  return 'Done';
}

// ─── Press / Type ───────────────────────────────────────────────────────────

export async function pressKey(page, target, key) {
  if (!target || target === key) {
    await page.keyboard.press(target);
    return 'Pressed ' + target;
  }
  const isRef = /^e\d+$/.test(target);
  if (isRef) {
    await page.locator('aria-ref=' + target).press(key);
    return 'Pressed ' + key;
  }
  let loc = page.getByText(target, { exact: true });
  if (await loc.count() === 0) loc = page.getByRole('textbox', { name: target });
  if (await loc.count() === 0) loc = page.getByRole('combobox', { name: target });
  if (await loc.count() === 0) loc = page.getByPlaceholder(target);
  if (await loc.count() === 0) loc = page.getByText(target);
  if (await loc.count() > 1) {
    const visible = loc.filter({ visible: true });
    const vc = await visible.count();
    if (vc >= 1) loc = vc === 1 ? visible : visible.first();
    else loc = loc.first();
  }
  await loc.press(key);
  return 'Pressed ' + key;
}

export async function typeText(page, text) {
  await page.keyboard.type(text);
  return 'Typed';
}

// ─── Highlight ──────────────────────────────────────────────────────────────

export async function highlightByText(page, text, nth?, exact?) {
  let loc = exact ? page.getByText(text, { exact: true }) : page.getByText(text);
  const count = await loc.count();
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.highlight();
  return nth !== undefined
    ? 'Highlighted 1 of ' + count
    : 'Highlighted ' + count + ' element' + (count !== 1 ? 's' : '');
}

export async function highlightByRole(page, role, name, nth, inRole?, inText?) {
  const isUrl = role === 'link' && name && /^\/|^https?:\/\//.test(name);
  const roleOpts = (name && !isUrl) ? { name, exact: true } : {};
  let loc = isUrl ? page.locator('a[href^="' + name + '"]:not([aria-hidden="true"])') : page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  const count = await loc.count();
  if (nth !== undefined) loc = loc.nth(nth);
  await loc.highlight();
  return nth !== undefined
    ? 'Highlighted 1 of ' + count
    : 'Highlighted ' + count + ' element' + (count !== 1 ? 's' : '');
}

export async function highlightBySelector(page, selector, nth?) {
  let loc = page.locator(selector);
  const count = await loc.count();
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.highlight();
  return nth !== undefined
    ? 'Highlighted 1 of ' + count
    : 'Highlighted ' + count + ' element' + (count !== 1 ? 's' : '');
}

export async function highlightByRef(page, ref) {
  const loc = page.locator('aria-ref=' + ref);
  await loc.highlight();
  return 'Highlighted';
}

export async function clearHighlight(page) {
  await page.locator('#__pw_clear__').highlight().catch(() => {});
  return 'Cleared';
}

// ─── Chaining (>> selectors) ────────────────────────────────────────────────

export async function chainAction(page, selector, action, value) {
  let loc = page.locator(selector);
  if (await loc.count() > 1) {
    const noHidden = page.locator(selector + ':not([aria-hidden="true"])');
    if (await noHidden.count() === 1) { loc = noHidden; }
    else {
      const visible = loc.filter({ visible: true });
      const vc = await visible.count();
      if (vc >= 1) loc = vc === 1 ? visible : visible.first();
      else loc = loc.first();
    }
  }
  try {
    if (value !== undefined) await loc[action](value);
    else await loc[action]();
  } catch {
    if (value !== undefined) await loc[action](value, { force: true });
    else await loc[action]({ force: true });
  }
  return 'Done';
}

// ─── Storage: localStorage ──────────────────────────────────────────────────

export async function localStorageGet(page, key) {
  return await page.evaluate(k => localStorage.getItem(k), key);
}

export async function localStorageSet(page, key, value) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
  return 'Set';
}

export async function localStorageDelete(page, key) {
  await page.evaluate(k => localStorage.removeItem(k), key);
  return 'Deleted';
}

export async function localStorageClear(page) {
  await page.evaluate(() => localStorage.clear());
  return 'Cleared';
}

export async function localStorageList(page) {
  const items = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      result[k] = localStorage.getItem(k);
    }
    return result;
  });
  return JSON.stringify(items, null, 2);
}

// ─── Storage: sessionStorage ────────────────────────────────────────────────

export async function sessionStorageGet(page, key) {
  return await page.evaluate(k => sessionStorage.getItem(k), key);
}

export async function sessionStorageSet(page, key, value) {
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [key, value]);
  return 'Set';
}

export async function sessionStorageDelete(page, key) {
  await page.evaluate(k => sessionStorage.removeItem(k), key);
  return 'Deleted';
}

export async function sessionStorageClear(page) {
  await page.evaluate(() => sessionStorage.clear());
  return 'Cleared';
}

export async function sessionStorageList(page) {
  const items = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      result[k] = sessionStorage.getItem(k);
    }
    return result;
  });
  return JSON.stringify(items, null, 2);
}

// ─── Cookies ────────────────────────────────────────────────────────────────

export async function cookieList(page) {
  const cookies = await page.context().cookies();
  return JSON.stringify(cookies, null, 2);
}

export async function cookieGet(page, name) {
  const cookies = await page.context().cookies();
  const c = cookies.find(c => c.name === name);
  return c ? JSON.stringify(c, null, 2) : 'Cookie not found: ' + name;
}

export async function cookieSet(page, name, value) {
  const url = page.url();
  await page.context().addCookies([{ name, value, url }]);
  return 'Cookie set: ' + name;
}

export async function cookieDelete(page, name) {
  await page.context().clearCookies({ name });
  return 'Cookie deleted: ' + name;
}

export async function cookieClear(page) {
  await page.context().clearCookies();
  return 'Cleared';
}

// ─── Console / Network (relay state on page.__relay) ────────────────────────
// Each function is self-contained — ensureRelayState is inlined so fn.toString() works.

export async function getConsoleMessages(page, clear) {
  if (!page.__relay) {
    page.__relay = { console: [], network: [], dialogMode: null, routes: [] };
    page.on('console', (msg) => { page.__relay.console.push('[' + msg.type() + '] ' + msg.text()); });
    page.on('response', (resp) => { const url = resp.url(); if (url.startsWith('chrome-extension://')) return; const req = resp.request(); page.__relay.network.push({ status: resp.status(), method: req.method(), url, type: req.resourceType() }); });
    page.on('dialog', async (dialog) => { if (page.__relay.dialogMode === 'accept') await dialog.accept(); else if (page.__relay.dialogMode === 'dismiss') await dialog.dismiss(); });
  }
  if (clear) { page.__relay.console = []; return 'Console cleared'; }
  return page.__relay.console.length === 0 ? 'No console messages (listening...)' : page.__relay.console.join('\n');
}

export async function getNetworkRequests(page, clear, includeStatic) {
  if (!page.__relay) {
    page.__relay = { console: [], network: [], dialogMode: null, routes: [] };
    page.on('console', (msg) => { page.__relay.console.push('[' + msg.type() + '] ' + msg.text()); });
    page.on('response', (resp) => { const url = resp.url(); if (url.startsWith('chrome-extension://')) return; const req = resp.request(); page.__relay.network.push({ status: resp.status(), method: req.method(), url, type: req.resourceType() }); });
    page.on('dialog', async (dialog) => { if (page.__relay.dialogMode === 'accept') await dialog.accept(); else if (page.__relay.dialogMode === 'dismiss') await dialog.dismiss(); });
  }
  if (clear) { page.__relay.network = []; return 'Network log cleared'; }
  let reqs = page.__relay.network;
  if (!includeStatic) {
    const skip = new Set(['stylesheet', 'image', 'font', 'media', 'other']);
    reqs = reqs.filter(r => !skip.has(r.type));
  }
  return reqs.length === 0
    ? 'No network requests (listening...)'
    : reqs.map(r => r.status + ' ' + r.method + ' ' + r.url).join('\n');
}

export async function setDialogAccept(page) {
  if (!page.__relay) {
    page.__relay = { console: [], network: [], dialogMode: null, routes: [] };
    page.on('console', (msg) => { page.__relay.console.push('[' + msg.type() + '] ' + msg.text()); });
    page.on('response', (resp) => { const url = resp.url(); if (url.startsWith('chrome-extension://')) return; const req = resp.request(); page.__relay.network.push({ status: resp.status(), method: req.method(), url, type: req.resourceType() }); });
    page.on('dialog', async (dialog) => { if (page.__relay.dialogMode === 'accept') await dialog.accept(); else if (page.__relay.dialogMode === 'dismiss') await dialog.dismiss(); });
  }
  page.__relay.dialogMode = 'accept';
  return 'Dialogs will be auto-accepted';
}

export async function setDialogDismiss(page) {
  if (!page.__relay) {
    page.__relay = { console: [], network: [], dialogMode: null, routes: [] };
    page.on('console', (msg) => { page.__relay.console.push('[' + msg.type() + '] ' + msg.text()); });
    page.on('response', (resp) => { const url = resp.url(); if (url.startsWith('chrome-extension://')) return; const req = resp.request(); page.__relay.network.push({ status: resp.status(), method: req.method(), url, type: req.resourceType() }); });
    page.on('dialog', async (dialog) => { if (page.__relay.dialogMode === 'accept') await dialog.accept(); else if (page.__relay.dialogMode === 'dismiss') await dialog.dismiss(); });
  }
  page.__relay.dialogMode = 'dismiss';
  return 'Dialogs will be auto-dismissed';
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function addRoute(page, pattern) {
  if (!page.__relay) page.__relay = { console: [], network: [], dialogMode: null, routes: [] };
  const handler = route => route.abort();
  await page.route(pattern, handler);
  page.__relay.routes.push({ pattern, handler });
  return 'Route added (blocked): ' + pattern;
}

export async function listRoutes(page) {
  const routes = (page.__relay && page.__relay.routes) || [];
  return routes.length === 0 ? 'No active routes' : routes.map(r => r.pattern).join('\n');
}

export async function removeRoute(page, pattern) {
  const routes = (page.__relay && page.__relay.routes) || [];
  if (routes.length === 0) return 'No routes to remove';
  const idx = routes.findIndex(r => r.pattern === pattern);
  if (idx === -1) return 'Route not found: ' + pattern;
  await page.unroute(pattern, routes[idx].handler);
  routes.splice(idx, 1);
  return 'Route removed: ' + pattern;
}

// ─── Tracing ────────────────────────────────────────────────────────────────

export async function tracingStart(page) {
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  return 'Tracing started';
}

export async function tracingStop(page) {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
  const dir = path.join(os.homedir(), 'pw-traces');
  fs.mkdirSync(dir, { recursive: true });
  const tracePath = path.join(dir, 'trace-' + timestamp + '.zip');
  await page.context().tracing.stop({ path: tracePath });
  const size = fs.statSync(tracePath).size;
  const sizeStr = size < 1024 * 1024 ? (size / 1024).toFixed(0) + ' KB' : (size / (1024 * 1024)).toFixed(1) + ' MB';
  return 'Trace saved to ' + tracePath + ' (' + sizeStr + ')';
}

// ─── Video ──────────────────────────────────────────────────────────────────

export async function videoStart(page) {
  const CDP = await page.context().newCDPSession(page);
  await CDP.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 2 });
  page.__videoSession = CDP;
  page.__videoFrames = [];
  page.__videoStartTime = Date.now();
  CDP.on('Page.screencastFrame', (params) => {
    if (page.__videoFrames) page.__videoFrames.push(params.data);
    CDP.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  });
  return 'Video recording started (screencast)';
}

export async function videoStop(page) {
  if (!page.__videoSession) return 'Not recording';
  await page.__videoSession.send('Page.stopScreencast');
  const frames = page.__videoFrames || [];
  const duration = Math.round((Date.now() - (page.__videoStartTime || 0)) / 1000);
  page.__videoSession = null;
  page.__videoFrames = null;
  page.__videoStartTime = null;
  return 'Video stopped (' + duration + 's, ' + frames.length + ' frames captured)';
}

// ─── Tabs (Playwright context.pages) ────────────────────────────────────────

export async function tabList(page) {
  const pages = page.context().pages();
  return JSON.stringify(pages.map((p, i) => ({
    index: i,
    title: '',
    url: p.url(),
    current: p === page,
  })), null, 2);
}

export async function tabNew(page, url) {
  const newPage = await page.context().newPage();
  if (url) await newPage.goto(url);
  return 'Opened new tab' + (url ? ': ' + url : '');
}

export async function tabClose(page, index) {
  const pages = page.context().pages();
  const target = index !== undefined ? pages[parseInt(index)] : page;
  if (!target) throw new Error('Tab ' + (index !== undefined ? index : 'current') + ' not found');
  const url = target.url();
  await target.close();
  return 'Closed: ' + url;
}

export async function tabSelect(page, index) {
  const pages = page.context().pages();
  const target = pages[parseInt(index)];
  if (!target) throw new Error('Tab ' + index + ' not found');
  await target.bringToFront();
  return 'Selected tab ' + index + ': ' + target.url();
}

// ─── Drag / Resize ──────────────────────────────────────────────────────────

export async function dragDrop(page, source, target) {
  let srcLoc = /^e\d+$/.test(source) ? page.locator('aria-ref=' + source) : page.getByText(source);
  let tgtLoc = /^e\d+$/.test(target) ? page.locator('aria-ref=' + target) : page.getByText(target);
  if (await srcLoc.count() > 1) srcLoc = srcLoc.filter({ visible: true }).first();
  if (await tgtLoc.count() > 1) tgtLoc = tgtLoc.filter({ visible: true }).first();
  await srcLoc.dragTo(tgtLoc);
  return 'Dragged';
}

export async function resizeViewport(page, width, height) {
  await page.setViewportSize({ width: parseInt(width), height: parseInt(height) });
  return 'Resized to ' + width + 'x' + height;
}
