/**
 * Catches the class of bug that took two pages down in production.
 *
 * `/audit-log` threw on every render because a <select> carried an onChange
 * handler inside a Server Component. Event handlers cannot cross that boundary
 * — React throws, the error boundary swallows the message, and the user sees
 * only a digest. That page had NEVER rendered since the handler was added, and
 * nothing noticed: typecheck passes, the build passes, and every unit test in
 * this repo tests pure functions in lib/.
 *
 * A browser-driven smoke test would be the thorough answer and needs a running
 * server, a seeded session and a browser in CI. This is the proportionate one:
 * it reads the files and fails on the specific mistake that has actually
 * happened, in about a second.
 *
 * It cannot catch every render-time failure. It catches this one, and this one
 * has bitten.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SCANNED = ["app", "components"];

/** React DOM props that only work in a client component. */
const HANDLER_PROPS = [
  "onClick", "onChange", "onSubmit", "onInput", "onBlur", "onFocus",
  "onKeyDown", "onKeyUp", "onMouseEnter", "onMouseLeave", "onScroll",
];

/**
 * Browser-only globals, which cannot appear in a server render path.
 *
 * `document.` is deliberately NOT here. This is a compliance platform: half the
 * codebase iterates over documents, and `documents.forEach((document) => …)` or
 * the prose "signed policy document." both match a naive check. Two legitimate
 * files failed on exactly that. A test that cries wolf gets switched off, and
 * then it protects nothing — so the check keeps only the globals whose names
 * are not also domain vocabulary.
 *
 * Matched with a lookbehind so `myWindow.` and `props.window.` do not count.
 */
const BROWSER_GLOBALS = ["window", "localStorage", "sessionStorage"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return file.slice(ROOT.length + 1).replace(/\\/g, "/");
}

const files = SCANNED.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
});

/** A file is a client component only if it declares so on its first real line. */
function isClientComponent(source: string): boolean {
  return /^\s*(["'])use client\1/m.test(source.split("\n").slice(0, 5).join("\n"));
}

/** Strips comments so a handler named in prose does not count as a use. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

describe("server/client boundary", () => {
  it("finds files to check at all", () => {
    // Guards the guard: a broken walk would make every assertion below pass
    // vacuously, which is the worst kind of green.
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no event handlers in server components", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (isClientComponent(source)) continue;

      const body = stripComments(source);
      for (const prop of HANDLER_PROPS) {
        // JSX prop position only: `onChange={` — not an object key or a mention.
        if (new RegExp(`\\s${prop}=\\{`).test(body)) {
          offenders.push(`${relative(file)} uses ${prop} without "use client"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("has no browser globals in server components", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (isClientComponent(source)) continue;

      const body = stripComments(source);
      for (const g of BROWSER_GLOBALS) {
        if (new RegExp(`(?<![\\w.])${g}\\.`).test(body)) {
          offenders.push(`${relative(file)} touches ${g} without "use client"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("route conventions", () => {
  const pages = files.filter((f) => f.endsWith("page.tsx") && f.includes(`${"app"}`));

  it("finds the app's pages", () => {
    expect(pages.length).toBeGreaterThan(30);
  });

  it("declares a runtime on every page", () => {
    // Cloudflare Pages cannot serve a Node-runtime route. A page missing this
    // builds fine and fails only once deployed, which is the slowest possible
    // place to learn it.
    const missing = pages
      .filter((f) => !readFileSync(f, "utf8").includes("export const runtime"))
      .map(relative);

    expect(missing).toEqual([]);
  });
});
