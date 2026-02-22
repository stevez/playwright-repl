// Content recorder — injected into pages via chrome.scripting.executeScript.
// Captures user interactions and sends .pw commands via chrome.runtime.sendMessage.

(() => {
  if (document.documentElement.dataset.pwRecorderActive) return;
  document.documentElement.dataset.pwRecorderActive = "true";

  function getLocator(el: Element): string {
    const ariaLabel = el.getAttribute && el.getAttribute("aria-label");
    if (ariaLabel) return quote(ariaLabel);

    if (el.id) {
      const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (label && label.textContent!.trim()) return quote(label.textContent!.trim());
    }
    const parentLabel = el.closest && el.closest("label");
    if (parentLabel && parentLabel.textContent!.trim()) {
      return quote(parentLabel.textContent!.trim());
    }

    if ((el as HTMLInputElement).placeholder) return quote((el as HTMLInputElement).placeholder);

    const text = el.textContent ? el.textContent.trim() : "";
    if (text && text.length < 80 && el.children.length === 0) return quote(text);

    if ((el.tagName === "BUTTON" || el.tagName === "A") && text && text.length < 80) {
      return quote(text);
    }

    if ((el as HTMLElement).title) return quote((el as HTMLElement).title);

    const tag = el.tagName ? el.tagName.toLowerCase() : "unknown";
    return quote(tag);
  }

  // Get the primary text of a container (e.g., a list item's label)
  function getItemContext(el: Element): string | null {
    const item = el.closest && el.closest("li, tr, [role=listitem], [role=row], article");
    if (!item) return null;
    const primary = item.querySelector("label, h1, h2, h3, h4, [class*=title], [class*=text], p, span");
    if (primary && primary !== el && primary.textContent!.trim()) {
      const t = primary.textContent!.trim();
      if (t.length < 80) return t;
    }
    return null;
  }

  function quote(s: string): string {
    return '"' + s.replace(/"/g, '\\"') + '"';
  }

  // Check if the locator text matches multiple interactive elements on the page.
  // Returns ' --nth N' suffix if ambiguous, '' if unique.
  function nthSuffix(el: Element, locator: string): string {
    var selector = 'a, button, input, textarea, select, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=option], [aria-label]';
    var candidates = document.querySelectorAll(selector);
    var matches: Element[] = [];
    for (var i = 0; i < candidates.length; i++) {
      if (getLocator(candidates[i]) === locator) matches.push(candidates[i]);
    }
    if (matches.length <= 1) return '';
    var idx = matches.indexOf(el);
    if (idx === -1) {
      for (var j = 0; j < matches.length; j++) {
        if (matches[j].contains(el)) { idx = j; break; }
      }
    }
    return idx >= 0 ? ' --nth ' + idx : '';
  }

  function send(command: string): void {
    chrome.runtime.sendMessage({ type: "pw-recorded-command", command });
  }

  let fillTimer: ReturnType<typeof setTimeout> | null = null;
  let fillTarget: HTMLInputElement | HTMLTextAreaElement | null = null;
  let fillValue: string = "";

  function flushFill(): void {
    if (fillTarget && fillValue) {
      const locator = getLocator(fillTarget);
      send('fill ' + locator + nthSuffix(fillTarget, locator) + ' "' + fillValue.replace(/"/g, '\\"') + '"');
    }
    fillTimer = null;
    fillTarget = null;
    fillValue = "";
  }

  // Only record clicks on interactive elements (or their children)
  var clickableTags: Set<string> = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "DETAILS"]);
  var clickableRoles: Set<string> = new Set(["button", "link", "tab", "menuitem", "checkbox", "option", "switch", "radio", "treeitem"]);

  function isClickable(el: Element): boolean {
    var node: Element | null = el;
    while (node && node !== document.body) {
      if (clickableTags.has(node.tagName)) return true;
      var role = node.getAttribute && node.getAttribute("role");
      if (role && clickableRoles.has(role)) return true;
      if (node.getAttribute && node.getAttribute("onclick")) return true;
      node = node.parentElement;
    }
    return false;
  }

  function findCheckbox(el: Element): HTMLInputElement | null {
    if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox") return el as HTMLInputElement;
    if (el.tagName === "LABEL") {
      var input = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (input) return input;
      if ((el as HTMLLabelElement).htmlFor) {
        var target = document.getElementById((el as HTMLLabelElement).htmlFor) as HTMLInputElement | null;
        if (target && target.type === "checkbox") return target;
      }
    }
    var parentLabel = el.closest("label");
    if (parentLabel) {
      var cb = parentLabel.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb) return cb;
    }
    return null;
  }

  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function handleClick(e: MouseEvent): void {
    try {
      var el = e.target as Element;
      if (!el || !el.tagName) return;

      // Skip text inputs and textareas — handled by handleInput
      if ((el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox" && (el as HTMLInputElement).type !== "radio") || el.tagName === "TEXTAREA") return;

      // Skip clicks on non-interactive elements
      if (!isClickable(el)) return;

      // Links: emit immediately (page navigates before debounce timer fires)
      if (el.closest && el.closest("a[href]")) {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        if (fillTimer) { clearTimeout(fillTimer); flushFill(); }
        emitClick(e);
        return;
      }

      // Delay other clicks to allow dblclick dedup
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        emitClick(e);
      }, 250);
    } catch(err) {
      send("# click recording error: " + (err as Error).message);
    }
  }

  function emitClick(e: MouseEvent): void {
    try {
      if (fillTimer) { clearTimeout(fillTimer); flushFill(); }
      var el = e.target as Element;

      // Check for checkbox (direct or via label/parent)
      var checkbox = findCheckbox(el);
      if (checkbox) {
        var cbLabel = getItemContext(checkbox) || "";
        if (cbLabel) {
          var cbLocator = quote(cbLabel);
          var cbNth = nthSuffix(checkbox, cbLocator);
          send(checkbox.checked ? 'check ' + cbLocator + cbNth : 'uncheck ' + cbLocator + cbNth);
        } else {
          var loc = getLocator(checkbox);
          var locNth = nthSuffix(checkbox, loc);
          send(checkbox.checked ? 'check ' + loc + locNth : 'uncheck ' + loc + locNth);
        }
        return;
      }

      var locator = getLocator(el);
      var nth = nthSuffix(el, locator);
      var actionWords = new Set(["delete", "remove", "edit", "close", "destroy", "\u00d7", "\u2715", "\u2716", "\u2717", "\u2718", "x"]);
      var elText = (el.textContent || "").trim().toLowerCase();
      var elClass = ((el as HTMLElement).className || "").toLowerCase();
      var elAriaLabel = (el.getAttribute && el.getAttribute("aria-label") || "").toLowerCase();
      var isAction = actionWords.has(elText)
        || [...actionWords].some(function(w) { return elClass.includes(w); })
        || [...actionWords].some(function(w) { return elAriaLabel.includes(w); })
        || (el.tagName === "BUTTON" && !elText && el.closest && el.closest("li, tr, [role=listitem]"));
      try {
        var ctx = getItemContext(el);
        if (ctx && isAction) {
          send('click ' + locator + ' "' + ctx.replace(/"/g, '\\"') + '"');
        } else {
          send('click ' + locator + nth);
        }
      } catch(_ce) {
        send('click ' + locator + nth);
      }
    } catch(err) {
      send("# click recording error: " + (err as Error).message);
    }
  }

  function handleDblClick(e: MouseEvent): void {
    try {
      // Cancel pending single click — dblclick supersedes it
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      if (fillTimer) { clearTimeout(fillTimer); flushFill(); }
      var el = e.target as Element;
      if (!el || !el.tagName) return;
      if (!isClickable(el)) return;
      var locator = getLocator(el);
      send('dblclick ' + locator + nthSuffix(el, locator));
    } catch(err) {
      send("# dblclick recording error: " + (err as Error).message);
    }
  }

  function handleContextMenu(e: MouseEvent): void {
    try {
      var el = e.target as Element;
      if (!el || !el.tagName) return;
      if (!isClickable(el)) return;
      var locator = getLocator(el);
      send('click ' + locator + nthSuffix(el, locator) + ' --button right');
    } catch(err) {
      send("# contextmenu recording error: " + (err as Error).message);
    }
  }

  function handleInput(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
    if ((el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio") return;
    fillTarget = el;
    fillValue = el.value;
    if (fillTimer) clearTimeout(fillTimer);
    fillTimer = setTimeout(flushFill, 1500);
  }

  function handleChange(e: Event): void {
    const el = e.target as Element;
    if (el.tagName === "SELECT") {
      const selEl = el as HTMLSelectElement;
      const opt = selEl.options[selEl.selectedIndex];
      const optText = opt ? opt.text.trim() : selEl.value;
      const locator = getLocator(el);
      send('select ' + locator + nthSuffix(el, locator) + ' "' + optText.replace(/"/g, '\\"') + '"');
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    const specialKeys = ["Enter", "Tab", "Escape"];
    if (specialKeys.includes(e.key)) {
      if (fillTimer) { clearTimeout(fillTimer); flushFill(); }
      send('press ' + e.key);
    }
  }

  document.addEventListener("click", handleClick, true);
  document.addEventListener("dblclick", handleDblClick, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleChange, true);
  document.addEventListener("keydown", handleKeydown, true);

  window.__pwRecorderCleanup = () => {
    if (fillTimer) { clearTimeout(fillTimer); flushFill(); }
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("dblclick", handleDblClick, true);
    document.removeEventListener("contextmenu", handleContextMenu, true);
    document.removeEventListener("input", handleInput, true);
    document.removeEventListener("change", handleChange, true);
    document.removeEventListener("keydown", handleKeydown, true);
    delete document.documentElement.dataset.pwRecorderActive;
    delete window.__pwRecorderCleanup;
  };
})();
