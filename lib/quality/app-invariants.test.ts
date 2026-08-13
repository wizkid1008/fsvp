import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { protectedRoutes, roleProtectedRoutes } from "@/lib/constants";

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
 * UPDATE 2026-08-13: rendering IS now possible, and needed neither jsdom nor a
 * new dependency — see lib/quality/render.ts. An App Router server component is
 * an async function returning plain objects, so a test can call it and walk the
 * result. lib/quality/supabase-mock.ts supplies the other half, and
 * importers-page.test.ts is the first page covered.
 *
 * These structural checks still earn their place. They cover all 47 pages at
 * once for a class of error a per-page test would have to be written to catch,
 * and they are what fails when a NEW page forgets a guard — the page nobody has
 * written a test for yet.
 *
 * They are deliberately about SHAPE, not behaviour. A check that needs updating
 * whenever a page changes would be abandoned; these only fire on a genuine
 * category error.
 */

const APP_DIR = join(process.cwd(), "app");
const COMPONENTS_DIR = join(process.cwd(), "components");

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

function routeForPage(page: string): string {
  const withoutApp = page.replace(/^app/, "").replace(/\/page\.tsx$/, "");
  return withoutApp === "" ? "/" : withoutApp;
}

function routeMatchesPrefix(route: string, prefix: string): boolean {
  return route === prefix || route.startsWith(`${prefix}/`);
}

const ALL_FILES = walk(APP_DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
const PAGES = ALL_FILES.filter((f) => /[\\/]page\.tsx$/.test(f));
const ROUTES = ALL_FILES.filter((f) => /[\\/]route\.ts$/.test(f));

/**
 * The server-component check covers components/ as well as app/. A page is not
 * the only place that renders on the server: a shared component imported by one
 * takes the whole page down with it, and there are three times as many of them.
 */
const RENDERABLE = [
  ...ALL_FILES.filter((f) => f.endsWith(".tsx")),
  ...walk(COMPONENTS_DIR).filter((f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f)),
];

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
  "app/suppliers/page.tsx",           // redirect only, to /exporters
  "app/shipment-readiness/page.tsx",  // redirect only, to /entry-readiness
]);

/**
 * Pages that are CLIENT components and therefore cannot call a server-side
 * guard at all. Deliberately a separate list from PUBLIC_PAGES: these are not
 * public, and recording them as such would be a dangerous lie in the one place
 * that documents which pages are open.
 *
 * Their protection is middleware plus the APIs they call, both of which
 * authenticate. That is weaker than a server guard — it is worth converting
 * them rather than growing this list.
 */
const CLIENT_GUARDED_PAGES = new Set([
  "app/fsvp-records/new/page.tsx",
]);

/**
 * Routes that cannot identify a caller because they are what CREATES the
 * session. The auth callback exchanges a one-time code for a session; requiring
 * a session to reach it would make signing in impossible.
 *
 * This is the only acceptable reason for a route to skip authentication, and
 * anything added here needs one just as specific.
 */
const PUBLIC_ROUTES = new Set([
  "app/auth/callback/route.ts",
]);

/**
 * Routes authenticated by a machine secret rather than a Supabase session.
 * These are not public: they must verify a deliberately configured secret and
 * stay disabled when that secret is absent.
 */
const MACHINE_AUTH_ROUTES = new Set([
  "app/api/cron/compliance/route.ts",
]);

describe("server components", () => {
  // The /audit-log failure exactly: a <select onChange={…}> in a Server
  // Component. React throws at render, the boundary shows a digest, and the
  // page had never worked since the day it was written.
  const CLIENT_ONLY = [
    { name: "an event handler prop", re: /\son[A-Z]\w*=\{/ },
    { name: "a React hook", re: /\buse(State|Effect|Ref|Memo|Callback|Transition|Reducer|Context|Router|SearchParams|Pathname)\s*\(/ },
    // `document` is deliberately absent. This is a compliance platform: the
    // codebase is full of `documents.forEach((document) => …)` and prose like
    // "signed policy document.", both of which match. Two legitimate files
    // failed on exactly that when components/ came into scope. A check that
    // cries wolf gets switched off, after which it protects nothing.
    { name: "a browser global", re: /(?<![\w.])(window|localStorage|sessionStorage)\s*\./ },
  ];

  it("never use client-only constructs without the 'use client' directive", () => {
    const violations: string[] = [];

    for (const file of RENDERABLE) {
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
      .filter((p) => !PUBLIC_PAGES.has(p) && !CLIENT_GUARDED_PAGES.has(p))
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

  it("all private pages are covered by middleware route prefixes", () => {
    const privatePages = PAGES
      .map(rel)
      .filter((p) => !PUBLIC_PAGES.has(p));

    const unprotected = privatePages
      .map(routeForPage)
      .filter((route) => !protectedRoutes.some((prefix) => routeMatchesPrefix(route, prefix)));

    expect(
      unprotected,
      "These private pages call server guards or rely on client/API guards, but " +
      "middleware will not redirect anonymous users before rendering them.\n" +
      unprotected.join("\n")
    ).toEqual([]);
  });

  it("orders more-specific role prefixes before broader ones", () => {
    const prefixes = Object.keys(roleProtectedRoutes);
    const shadowed = prefixes.filter((prefix, index) =>
      prefixes.slice(0, index).some((earlier) => routeMatchesPrefix(prefix, earlier))
    );

    expect(
      shadowed,
      "roleProtectedRoutes is checked with the first matching prefix. Put nested " +
      "routes such as /fsvp-records/new before their broader parent.\n" +
      shadowed.join("\n")
    ).toEqual([]);
  });

  it("keeps the exemption lists honest — every entry still exists", () => {
    // A renamed page would otherwise leave a stale exemption behind, and the
    // replacement would be unguarded with nothing complaining. The same applies
    // to routes: a dead exemption is a hole waiting for a file to fall into it.
    const pages = new Set(PAGES.map(rel));
    const routes = new Set(ROUTES.map(rel));

    const stale = [
      ...[...PUBLIC_PAGES].filter((p) => !pages.has(p)),
      ...[...CLIENT_GUARDED_PAGES].filter((p) => !pages.has(p)),
      ...[...PUBLIC_ROUTES].filter((p) => !routes.has(p)),
      ...[...MACHINE_AUTH_ROUTES].filter((p) => !routes.has(p)),
    ];

    expect(stale, `Exemptions for files that no longer exist:\n${stale.join("\n")}`).toEqual([]);
  });
});

describe("API routes", () => {
  it("all establish who is calling", () => {
    // Every route uses the service-role client somewhere downstream, which
    // bypasses row-level security entirely. Authentication in the handler is
    // therefore the only thing standing between a caller and other tenants'
    // data — RLS will not catch a mistake here.
    const unguarded = ROUTES
      .map(rel)
      .filter((p) => !PUBLIC_ROUTES.has(p))
      .filter((p) => !MACHINE_AUTH_ROUTES.has(p))
      .filter((p) => !/auth\.getUser\(\)/.test(readFileSync(join(process.cwd(), p), "utf8")));

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

  it("machine-authenticated routes verify a trigger secret", () => {
    const missing = [...MACHINE_AUTH_ROUTES]
      .filter((p) => !/verifyIngestTriggerSecret/.test(readFileSync(join(process.cwd(), p), "utf8")));

    expect(
      missing,
      "These routes bypass Supabase user auth and must prove they check the " +
      "machine trigger secret instead.\n" + missing.join("\n")
    ).toEqual([]);
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
