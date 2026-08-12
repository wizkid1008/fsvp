import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { navItems } from "@/data/nav-items";
import { protectedRoutes, roleProtectedRoutes } from "@/lib/constants";
import type { AppRole } from "@/types/platform";

/**
 * The sidebar and the middleware must agree about who can go where.
 *
 * They are two hand-maintained lists — `navItems` in data/nav-items.ts and
 * `roleProtectedRoutes` in lib/constants.ts — and nothing checked them against
 * each other. On 2026-08-12 an administrator was found unable to see any
 * exporter or supplier list from any screen, because the Exporters nav item
 * said `roles: ["us_importer"]` while the route permitted administrators too.
 * The page existed, the permission existed, and there was simply no link. The
 * same session found /my-readiness role-gated, protected, and linked from
 * nowhere at all.
 *
 * Neither is the kind of bug a person notices in review — both were found by
 * the user clicking. These checks are cheap and would have failed at push time
 * on both.
 */

/** Mirrors middleware.ts: first matching prefix wins. */
function permittedRolesFor(href: string): string[] | null {
  const entry = Object.entries(roleProtectedRoutes).find(([route]) => href.startsWith(route));
  return entry ? entry[1] : null;
}

function navItemsFor(role: AppRole) {
  // An item with no `roles` is shown to everyone — see AppShell's filter.
  return navItems.filter((item) => !item.roles || item.roles.includes(role));
}

/**
 * Routes a role may reach but which deliberately have no sidebar entry.
 * Every exemption needs a reason, because an unexplained one is
 * indistinguishable from the bug this file exists to catch.
 */
const NO_NAV_ENTRY = new Set([
  // Superseded by /exporters; kept only as a redirect for old bookmarks.
  "/suppliers",
  // Reached from the /fsvp-records list page, not from the sidebar.
  "/fsvp-records/new",
  // Deliberately moved to the header bell (components/layout/NotificationBell).
  "/notifications",
]);

/**
 * What an administrator must be able to reach from the sidebar.
 *
 * Derivation cannot carry this one. Middleware lets administrators bypass every
 * role restriction, so "permitted" is trivially true for them everywhere and
 * proves nothing about whether a link exists. This is the curated answer to
 * "what would an admin notice was missing", which is exactly what went wrong.
 */
const ADMIN_MUST_REACH = [
  "/dashboard",
  "/exporters",
  "/importers",
  "/facilities",
  "/products",
  "/reviewer",
  "/audit-log",
  "/admin",
];

describe("nav and route permissions agree", () => {
  it("never offers a role a link that middleware will bounce", () => {
    const violations: string[] = [];

    for (const item of navItems) {
      const permitted = permittedRolesFor(item.href);
      if (!permitted) continue; // unrestricted route

      for (const role of item.roles ?? []) {
        if (!permitted.includes(role)) {
          violations.push(
            `${item.label} (${item.href}) is shown to "${role}", but roleProtectedRoutes permits [${permitted.join(", ")}]`
          );
        }
      }
    }

    expect(
      violations,
      "These sidebar links lead to a redirect back to /dashboard. Either add the " +
      "role in lib/constants.ts or remove it from data/nav-items.ts.\n" +
      violations.join("\n")
    ).toEqual([]);
  });

  it("gives every non-admin role a link to each route it is permitted", () => {
    // Administrators are excluded on purpose: middleware bypasses all role
    // restrictions for them, so this direction is vacuous. ADMIN_MUST_REACH
    // below covers them instead.
    const unreachable: string[] = [];

    for (const [route, roles] of Object.entries(roleProtectedRoutes)) {
      if (NO_NAV_ENTRY.has(route)) continue;

      for (const role of roles) {
        if (role === "administrator") continue;
        const reachable = navItemsFor(role as AppRole).some((item) => item.href.startsWith(route));
        if (!reachable) {
          unreachable.push(`"${role}" may open ${route} but no sidebar item links there`);
        }
      }
    }

    expect(
      unreachable,
      "These routes are permitted but orphaned — the page exists, the permission " +
      "exists, and nothing links to it. Add a nav item, or add the route to " +
      "NO_NAV_ENTRY with a reason.\n" + unreachable.join("\n")
    ).toEqual([]);
  });

  it("lets an administrator reach the core screens", () => {
    const missing = ADMIN_MUST_REACH.filter(
      (href) => !navItemsFor("administrator").some((item) => item.href === href)
    );

    expect(
      missing,
      "An administrator has no sidebar link to these. This is the exact shape of " +
      "the bug where admins could see Facilities and Products but neither the " +
      "exporters nor the importers they belong to.\n" + missing.join("\n")
    ).toEqual([]);
  });
});

describe("nav targets", () => {
  it("all point at a page that exists", () => {
    // A renamed route leaves a nav item pointing at a 404, and nothing else
    // notices — /suppliers became /exporters in this codebase on 2026-08-12.
    const missing = navItems
      .map((item) => item.href)
      .filter((href, i, all) => all.indexOf(href) === i)
      .filter((href) => !existsSync(join(process.cwd(), "app", href.replace(/^\//, ""), "page.tsx")));

    expect(
      missing,
      `Sidebar links with no app/<route>/page.tsx:\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("are all covered by middleware's protected prefixes", () => {
    // Every destination in the signed-in sidebar is private by definition.
    const unprotected = navItems
      .map((item) => item.href)
      .filter((href, i, all) => all.indexOf(href) === i)
      .filter((href) => !protectedRoutes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`)));

    expect(
      unprotected,
      "These sidebar destinations are not covered by protectedRoutes, so an " +
      "anonymous visitor reaches them without a redirect.\n" + unprotected.join("\n")
    ).toEqual([]);
  });
});
