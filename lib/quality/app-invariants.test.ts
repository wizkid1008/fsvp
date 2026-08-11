import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural checks over app/, aimed at the bugs that actually reach production
 * here rather than the ones unit tests already catch.
 *
 * The existing suite tests pure logic in lib/ and tests it well. But on
 * 2026-08-11 two pages were found completely broken in production — /reviewer
 * and /audit-log, the latter having never rendered since it was written — and
 * both were found by a person clicking, because nothing covers the 42 pages or
 * 57 routes at all.
 *
 * Rendering them properly would need jsdom and a mocked Supabase, which this
 * project has no setup for. These checks are cheaper and, for the specific
 * failures seen, sharper: every one below would have failed at push time on a
 * bug that instead reached users.
 *
 * They are deliberately about SHAPE, not behaviour. A check that needs updating
 * whenever a page changes would be abandoned; these only fire on a genuine
 * category error.
 */

const APP_DIR = join(process.cwd(), "app");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Repo-relative, forward-slashed, so failures read the same on any platform. */
function rel(path: string): string {
  return path.slice(process.cwd().length + 1).split("\\").join("/");
}

/** Crudely strips comments so prose about `window` is not read as code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const ALL_FILES = walk(APP_DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
const PAGES = ALL_FILES.filter((f) => /[\\/]page\.tsx$/.test(f));
const ROUTES = ALL_FILES.filter((f) => /[\\/]route\.ts$/.test(f));

/**
 * Pages that legitimately serve signed-out visitors. Anything not listed must
 * authenticate — a new page that forgets to is a data leak, and this list is
 * the only place that decision is recorded.
 */
const PUBLIC_PAGES = new Set([
  "app/page.tsx",
  "app/about/page.tsx",
  "app/contact/page.tsx",
  "app/login/page.tsx",
  "app/signup/page.tsx",
  "app/forgot-password/page.tsx",
  "app/reset-password/page.tsx",
  "app/verified/page.tsx",
  "app/accept-invite/page.tsx",   // token-scoped, guarded inside
  "app/claim-exporter/page.tsx",  // token-scoped, guarded inside
  "app/pending-approval/page.tsx",
  "app/products-facilities/page.tsx", // redirect only
]);

describe("server components", () => {
  // The /audit-log failure exactly: a <select onChange={…}> in a Server
  // Component. React throws at render, the boundary shows a digest, and the
  // page had never worked since the day it was written.
  const CLIENT_ONLY = [
    { name: "an event handler prop", re: /\son[A-Z]\w*=\{/ },
    { name: "a React hook", re: /\buse(State|Effect|Ref|Memo|Callback|Transition|Reducer|Context|Router|SearchParams|Pathname)\s*\(/ },
    { name: "a browser global", re: /\b(window|document|localStorage|sessionStorage)\s*\./ },
  ];

  it("never use client-only constructs without the 'use client' directive", () => {
    const violations: string[] = [];

    for (const file of ALL_FILES.filter((f) => f.endsWith(".tsx"))) {
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/m.test(src)) continue;

      const code = stripComments(src);
      for (const { name, re } of CLIENT_ONLY) {
        const match = code.match(re);
        if (match) violations.push(`${rel(file)} uses ${name} (${match[0].trim()})`);
      }
    }

    expect(
      violations,
      "These render on the server, where React throws and the page shows only an " +
      "error digest. Move the interactive part into a client component.\n" +
      violations.join("\n")
    ).toEqual([]);
  });
});

describe("pages", () => {
  it("all export a default component", () => {
    const missing = PAGES
      .filter((f) => !/export\s+default\s+(async\s+)?function|export\s+default\s+\w+/.test(readFileSync(f, "utf8")))
      .map(rel);

    expect(missing).toEqual([]);
  });

  it("authenticate unless listed as public", () => {
    // A page that forgets this serves tenant data to anyone with the URL. The
    // allowlist above is the only record of which pages are meant to be open,
    // so adding one is a deliberate act rather than an omission.
    const unguarded = PAGES
      .map(rel)
      .filter((p) => !PUBLIC_PAGES.has(p))
      .filter((p) => {
        const src = readFileSync(join(process.cwd(), p), "utf8");
        return !/requireProfileRole|requireUser/.test(src);
      });

    expect(
      unguarded,
      "These pages read data without establishing who is asking. Either call " +
      "requireProfileRole/requireUser, or add them to PUBLIC_PAGES with a reason.\n" +
      unguarded.join("\n")
    ).toEqual([]);
  });

  it("keeps the public list honest — every entry still exists", () => {
    // A renamed page would otherwise leave a stale exemption behind, and the
    // replacement would be unguarded with nothing complaining.
    const actual = new Set(PAGES.map(rel));
    const stale = [...PUBLIC_PAGES].filter((p) => !actual.has(p));
    expect(stale, `Public-page exemptions for files that no longer exist:\n${stale.join("\n")}`).toEqual([]);
  });
});

describe("API routes", () => {
  it("all establish who is calling", () => {
    // Every route uses the service-role client somewhere downstream, which
    // bypasses row-level security entirely. Authentication in the handler is
    // therefore the only thing standing between a caller and other tenants'
    // data — RLS will not catch a mistake here.
    const unguarded = ROUTES
      .filter((f) => !/auth\.getUser\(\)/.test(readFileSync(f, "utf8")))
      .map(rel);

    expect(
      unguarded,
      "These routes never identify the caller. Because the admin client bypasses " +
      "RLS, that is an unauthenticated path to tenant data.\n" + unguarded.join("\n")
    ).toEqual([]);
  });

  it("declare a runtime, since the deployment target needs one", () => {
    const missing = ROUTES
      .filter((f) => !/export\s+const\s+runtime\s*=/.test(readFileSync(f, "utf8")))
      .map(rel);

    expect(missing).toEqual([]);
  });
});

describe("coverage of this check", () => {
  it("actually found the files it is meant to be checking", () => {
    // Guards against the checks above silently passing because a path changed
    // and they are now inspecting nothing at all.
    expect(PAGES.length).toBeGreaterThan(30);
    expect(ROUTES.length).toBeGreaterThan(40);
  });
});
