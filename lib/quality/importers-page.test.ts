import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "./supabase-mock";
import { resolve, text } from "./render";

/**
 * The first page-level test in this codebase, and it exists to lock the
 * cross-tenant leak fixed in 5f6f812.
 *
 * /importers reads through the ADMIN client, which bypasses RLS entirely, so
 * tenancy has to be re-applied in the page itself. When it was not, every
 * qualified individual on the platform could read every importer organization —
 * legal names, EINs, D-U-N-S numbers, contact emails. Nothing in the test suite
 * could have noticed, because nothing rendered a page.
 *
 * The assertions are on the QUERY, not on the mock's output. A mock that
 * evaluated `.eq()` would let this pass by agreeing with the page's intent
 * rather than by the page having the right intent. What matters is whether the
 * page asked a scoped question.
 */

let mock: SupabaseMock;
let mockRole = "administrator";
let mockRealRole = "administrator";

vi.mock("@/lib/auth/protection", () => ({
  requireProfileRole: async () => ({
    role: mockRole,
    realRole: mockRealRole,
    user: { id: "user-1", email: "kyle@example.com" },
    supabase: mock,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => mock,
}));

vi.mock("@/lib/supabase/admin-guard", () => ({
  tryAdminClient: () => ({ ok: true, client: mock }),
}));

// AppShell is a client component; it would run hooks outside React. Replaced
// with a passthrough so the page's own content is what gets asserted.
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

async function renderPage() {
  const { default: ImportersPage } = await import("@/app/importers/page");
  return resolve(await (ImportersPage as unknown as () => Promise<unknown>)());
}

function withProfile(id: string | null, rows: Record<string, unknown[]> = {}) {
  mock = createSupabaseMock({
    profiles: [{ importer_id: id }],
    ...rows,
  });
}

const TWO_IMPORTERS = {
  importers: [
    { id: "imp-1", legal_name: "Nutty Cathy LLC", display_name: "Nutty Cathy", ein: null,
      duns_number: null, food_scope: "human", status: "active",
      primary_contact_email: "a@example.com", created_at: "2026-08-13" },
    { id: "imp-2", legal_name: "Other Tenant Inc", display_name: "Other Tenant", ein: "99-9999999",
      duns_number: "123456789", food_scope: "both", status: "active",
      primary_contact_email: "b@example.com", created_at: "2026-08-01" },
  ],
};

beforeEach(() => {
  vi.resetModules();
  mockRole = "administrator";
  mockRealRole = "administrator";
  withProfile(null);
});

describe("/importers tenancy", () => {
  it("does not scope the query for an administrator", async () => {
    withProfile(null, TWO_IMPORTERS);
    await renderPage();

    expect(mock.filtered("importers", "id")).toBe(false);
  });

  it("does not scope for a reviewer holding no importer_id", async () => {
    // A platform-wide compliance reviewer. 004_reviewer_tenancy.sql.
    mockRole = "reviewer";
    mockRealRole = "reviewer";
    withProfile(null, TWO_IMPORTERS);
    await renderPage();

    expect(mock.filtered("importers", "id")).toBe(false);
  });

  it("scopes to one organization for a reviewer that holds an importer_id", async () => {
    // The leak. This reviewer is one tenant's qualified individual, and the
    // page reads through the admin client, so without an explicit filter they
    // would see every importer on the platform.
    mockRole = "reviewer";
    mockRealRole = "reviewer";
    withProfile("imp-1", TWO_IMPORTERS);
    await renderPage();

    const scoping = mock.callsFor("importers").find((c) => c.method === "eq" && c.args[0] === "id");
    expect(scoping, "the importers query was not scoped by id").toBeTruthy();
    expect(scoping!.args[1]).toBe("imp-1");
  });

  it("returns nothing rather than everything when a confined caller has no tenant", async () => {
    // A us_importer always has an importer_id in practice — but if one ever
    // reaches this page without, the failure has to be an empty list, never an
    // unfiltered query. That is the null-vs-null shape that broke /api/facilities.
    mockRole = "us_importer";
    mockRealRole = "us_importer";
    withProfile(null, TWO_IMPORTERS);
    await renderPage();

    const scoping = mock.callsFor("importers").find((c) => c.method === "eq" && c.args[0] === "id");
    expect(scoping, "an unscoped query is the leak this guard exists to stop").toBeTruthy();
    expect(scoping!.args[1]).toBe("00000000-0000-0000-0000-000000000000");
  });
});

describe("/importers content", () => {
  it("names the organizations it was given", async () => {
    withProfile(null, TWO_IMPORTERS);
    const page = await renderPage();
    const body = text(page);

    expect(body).toContain("Nutty Cathy");
    expect(body).toContain("Other Tenant");
  });

  it("flags an organization with no users as unclaimed", async () => {
    // An importer created by approval but never signed into. Without this the
    // row reads as a normal tenant and nobody chases it.
    withProfile(null, { ...TWO_IMPORTERS, profiles: [{ importer_id: null }] });
    const page = await renderPage();

    expect(text(page)).toContain("Unclaimed");
  });

  it("tells a confined caller the list is theirs alone", async () => {
    mockRole = "us_importer";
    mockRealRole = "us_importer";
    withProfile("imp-1", TWO_IMPORTERS);
    const page = await renderPage();

    expect(text(page)).toContain("The importing organization your account belongs to");
  });
});
