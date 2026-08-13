import { describe, expect, it } from "vitest";
import { deniesTenant, isCrossTenant, isTenantConfined, type TenancyProfile } from "./tenancy";

/**
 * The rule behind both cross-tenant leaks found on 2026-08-13, and it had no
 * tests. `reviewer` means two different things depending on whether the profile
 * carries an importer_id, and every guard that forgets it leaks or over-blocks.
 */

const admin: TenancyProfile          = { role: "administrator", importer_id: null };
const platformReviewer: TenancyProfile = { role: "reviewer", importer_id: null };
const tenantReviewer: TenancyProfile  = { role: "reviewer", importer_id: "imp-1" };
const importer: TenancyProfile        = { role: "us_importer", importer_id: "imp-1" };
const exporter: TenancyProfile        = { role: "exporter", importer_id: null };

describe("isCrossTenant", () => {
  it("admits administrators", () => {
    expect(isCrossTenant(admin)).toBe(true);
  });

  it("admits a reviewer holding no importer_id", () => {
    expect(isCrossTenant(platformReviewer)).toBe(true);
  });

  it("confines a reviewer that holds an importer_id", () => {
    // 004_reviewer_tenancy.sql: such a reviewer is one tenant's FSVP qualified
    // individual, not a platform-wide compliance reviewer. Treating the role
    // name alone as the answer is what leaked every importer organization and
    // every tenant's submitted evidence.
    expect(isCrossTenant(tenantReviewer)).toBe(false);
  });

  it("confines importers and exporters", () => {
    expect(isCrossTenant(importer)).toBe(false);
    expect(isCrossTenant(exporter)).toBe(false);
  });

  it("is the exact inverse of isTenantConfined", () => {
    for (const p of [admin, platformReviewer, tenantReviewer, importer, exporter]) {
      expect(isTenantConfined(p)).toBe(!isCrossTenant(p));
    }
  });
});

describe("deniesTenant", () => {
  it("never denies a cross-tenant actor, whatever the row", () => {
    expect(deniesTenant(admin, "imp-2")).toBe(false);
    expect(deniesTenant(platformReviewer, "imp-2")).toBe(false);
    expect(deniesTenant(admin, null)).toBe(false);
  });

  it("allows a confined actor its own tenant", () => {
    expect(deniesTenant(importer, "imp-1")).toBe(false);
    expect(deniesTenant(tenantReviewer, "imp-1")).toBe(false);
  });

  it("denies a confined actor another tenant", () => {
    expect(deniesTenant(importer, "imp-2")).toBe(true);
    expect(deniesTenant(tenantReviewer, "imp-2")).toBe(true);
  });

  it("denies a confined actor that holds no importer_id at all", () => {
    // The null-vs-null trap. A bare `row.importer_id !== profile.importer_id`
    // would return false here — allowing an unlinked account to write a row
    // whose importer_id is also null. deniesTenant checks the caller has a
    // tenant before comparing.
    const unlinked: TenancyProfile = { role: "us_importer", importer_id: null };
    expect(deniesTenant(unlinked, null)).toBe(true);
    expect(deniesTenant(unlinked, "imp-1")).toBe(true);
  });

  it("denies a confined actor a row with no tenant", () => {
    expect(deniesTenant(importer, null)).toBe(true);
  });
});

describe("what deniesTenant is NOT", () => {
  it("is not a drop-in replacement for guards on routes that admit reviewers", () => {
    // Recorded as a test because it is the trap a future refactor will fall
    // into. Twelve API routes hand-roll
    //
    //     row.importer_id !== profile.importer_id && role !== "administrator"
    //
    // which denies a PLATFORM reviewer. deniesTenant admits one. For routes
    // gated to ["us_importer", "administrator"] the two agree, so swapping is
    // safe. For routes that also admit "reviewer" — fsvp/hazard-analyses and
    // fsvp/verification-records — swapping would grant a platform-wide
    // reviewer cross-tenant WRITE access, and since those routes use the admin
    // client the route check is the only thing standing in the way.
    //
    // 004_reviewer_tenancy.sql deliberately moved write policies to
    // current_importer_ids_write(), which excludes reviewers. Any change here
    // has to preserve that.
    const handRolled = (p: TenancyProfile, rowImporterId: string | null) =>
      rowImporterId !== p.importer_id && p.role !== "administrator";

    expect(handRolled(platformReviewer, "imp-1")).toBe(true);   // denied
    expect(deniesTenant(platformReviewer, "imp-1")).toBe(false); // allowed

    // They agree on everyone else, which is why the difference is easy to miss.
    for (const p of [admin, tenantReviewer, importer]) {
      expect(handRolled(p, "imp-1")).toBe(deniesTenant(p, "imp-1"));
    }
  });
});
