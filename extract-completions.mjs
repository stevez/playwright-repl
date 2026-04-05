/**
 * Build script: extract-completions.mjs
 *
 * Parses Playwright's type declarations using the TypeScript compiler API
 * and emits a JSON file suitable for use as a CodeMirror 6 completion source.
 *
 * Usage:
 *   node extract-completions.mjs
 *   node extract-completions.mjs --out ./src/pw-completions.json
 *
 * Output shape:
 *   {
 *     "Page": [
 *       { "label": "goto", "type": "method", "detail": "(url: string, options?) => Promise<Response>", "info": "..." },
 *       ...
 *     ],
 *     "Locator": [...],
 *     ...
 *   }
 */

import ts from "typescript";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const TYPES_FILE = path.resolve(
  __dirname,
  "packages/cli/node_modules/playwright-core/types/types.d.ts"
);

// Only extract these top-level interfaces — the ones you actually use in a REPL
const TARGET_INTERFACES = new Set([
  "Page",
  "Locator",
  "BrowserContext",
  "Browser",
  "ElementHandle",
  "Frame",
  "Keyboard",
  "Mouse",
  "Touchscreen",
  "Request",
  "Response",
  "Route",
  "Download",
  "FileChooser",
  "Dialog",
  "ConsoleMessage",
]);

const outFile =
  process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : path.resolve(__dirname, "pw-completions.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deprecated/legacy methods per interface — only block where actually deprecated
// (e.g. isVisible is deprecated on Page but valid on Locator)
const DEPRECATED_BY_INTERFACE = {
  Page:          new Set(["$", "$$", "$eval", "$$eval", "waitForSelector", "waitForTimeout",
                          "isChecked", "isDisabled", "isEditable", "isEnabled", "isHidden", "isVisible",
                          "getAttribute", "innerText", "innerHTML", "textContent", "inputValue"]),
  Frame:         new Set(["$", "$$", "$eval", "$$eval", "waitForSelector", "waitForTimeout",
                          "isChecked", "isDisabled", "isEditable", "isEnabled", "isHidden", "isVisible",
                          "getAttribute", "innerText", "innerHTML", "textContent", "inputValue"]),
  ElementHandle: new Set(["$", "$$", "$eval", "$$eval", "waitForSelector"]),
};

/** Check if a member is deprecated (by interface blocklist or @deprecated JSDoc) */
function isDeprecated(interfaceName, memberName, node, sourceFile) {
  const blocklist = DEPRECATED_BY_INTERFACE[interfaceName];
  if (blocklist?.has(memberName)) return true;
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges?.length) return false;
  const last = ranges[ranges.length - 1];
  const comment = fullText.slice(last.pos, last.end);
  return /@deprecated/i.test(comment);
}

/** Extract the leading JSDoc comment text from a node */
function getDocComment(node, sourceFile) {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges?.length) return "";

  // Take the last comment block before the node (closest JSDoc)
  const last = ranges[ranges.length - 1];
  const comment = fullText.slice(last.pos, last.end);

  return comment
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    // Drop @param / @returns / @deprecated lines — keep prose only
    .filter((l) => !l.startsWith("@") && !l.startsWith("```") && l.length > 0)
    .join(" ")
    .slice(0, 300) // cap info length
    .trim();
}

/** Pretty-print a TypeScript type node back to a string */
function typeToString(checker, type) {
  return checker.typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  );
}

/** Determine CM6 completion type from TS symbol flags */
function completionType(symbol) {
  const flags = symbol.getFlags();
  if (flags & ts.SymbolFlags.Method) return "method";
  if (flags & ts.SymbolFlags.Property) return "property";
  if (flags & ts.SymbolFlags.GetAccessor) return "property";
  return "method";
}

/** Build a short signature string e.g. "(selector: string, options?) => Promise<void>" */
function buildDetail(checker, symbol, declaration) {
  try {
    if (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration)) {
      const sig = checker.getSignatureFromDeclaration(declaration);
      if (sig) {
        const params = sig
          .getParameters()
          .map((p) => {
            const pType = checker.getTypeOfSymbolAtLocation(p, declaration);
            const optional = p.getFlags() & ts.SymbolFlags.Optional ? "?" : "";
            return `${p.name}${optional}: ${checker.typeToString(pType)}`;
          })
          .join(", ");
        const retType = checker.typeToString(sig.getReturnType());
        return `(${params}) => ${retType}`;
      }
    }
    if (
      ts.isPropertySignature(declaration) ||
      ts.isPropertyDeclaration(declaration)
    ) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      return typeToString(checker, type);
    }
  } catch {
    // fall through
  }
  return "";
}

// ── Main ──────────────────────────────────────────────────────────────────────

const program = ts.createProgram([TYPES_FILE], {
  target: ts.ScriptTarget.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  noEmit: true,
});

const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(TYPES_FILE);

if (!sourceFile) {
  console.error("Could not load types file:", TYPES_FILE);
  process.exit(1);
}

const result = {};

// Walk top-level statements looking for interface declarations
for (const statement of sourceFile.statements) {
  if (!ts.isInterfaceDeclaration(statement)) continue;

  const name = statement.name.text;
  if (!TARGET_INTERFACES.has(name)) continue;

  const members = [];
  const seen = new Set();

  for (const member of statement.members) {
    // Skip index signatures, constructors, call signatures
    if (
      ts.isIndexSignatureDeclaration(member) ||
      ts.isConstructSignatureDeclaration(member) ||
      ts.isCallSignatureDeclaration(member)
    )
      continue;

    const memberName = member.name?.getText(sourceFile);
    if (!memberName || seen.has(memberName)) continue;
    seen.add(memberName);

    // Skip internal/private-looking members
    if (memberName.startsWith("_")) continue;

    // Skip deprecated members
    if (isDeprecated(name, memberName, member, sourceFile)) continue;

    const symbol = checker.getSymbolAtLocation(member.name);
    if (!symbol) continue;

    const info = getDocComment(member, sourceFile);
    const detail = buildDetail(checker, symbol, member);
    const type = completionType(symbol);

    members.push({
      label: memberName,
      type,
      detail: detail.length > 120 ? detail.slice(0, 120) + "…" : detail,
      info: info || undefined,
    });
  }

  if (members.length > 0) {
    result[name] = members;
    console.log(`  ${name}: ${members.length} members`);
  }
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(`\nWrote ${outFile}`);
console.log(
  `Total completions: ${Object.values(result).reduce((n, m) => n + m.length, 0)}`
);
