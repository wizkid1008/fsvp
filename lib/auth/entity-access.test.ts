import { describe, expect, it } from "vitest";
import {
  canWriteSupplierEntity,
  decideSupplierEntityAccess,
  firstDeniedSupplierId,
  type ActorProfile,
  type SupplierLink,
} from "./entity-access";

const EXPORTER_ID = "supplier-exporter";
const UPSTREAM_ID = "supplier-upstream";
const IMPORTER_ID = "importer-1";

const importer: ActorProfile = { role: "us_importer", supplier_id: null, importer_id: IMPORTER_ID };
const exporter: ActorProfile = { role: "exporter", supplier_id: EXPORTER_ID, importer_id: null };
const admin: ActorProfile = { role: "administrator", supplier_id: null, importer_id: null };
const platformReviewer: ActorProfile = { role: "reviewer", supplier_id: null, importer_id: null };
const tenantReviewer: ActorProfile = { role: "reviewer", supplier_id: null, importer_id: IMPORTER_ID };

function importerLink(supplierId: string, status = "active"): SupplierLink {
  return { relationship_type: "importer_supplier", status, supplier_id: supplierId, importer_id: IMPORTER_ID };
}

function exporterLink(supplierId: string, status = "active"): SupplierLink {
  return { relationship_type: "exporter_supplier", status, supplier_id: supplierId, exporter_id: EXPORTER_ID };
}

describe("importer access", () => {
  // The regression this file exists for. Before the fix, every one of these
  // returned false and /api/facilities answered 403 to every importer, which
  // also blocked products because a product requires a facility.
  it("allows an importer to write records for a linked exporter", () => {
    const decision = decideSupplierEntityAccess(importer, EXPORTER_ID, [importerLink(EXPORTER_ID)]);
    expect(decision).toEqual({ allowed: true, reason: "importer_link" });
  });

  it("counts a pending invite, since a managed exporter has not registered yet", () => {
    expect(canWriteSupplierEntity(importer, EXPORTER_ID, [importerLink(EXPORTER_ID, "pending_invite")])).toBe(true);
  });

  it("refuses a link that is neither active nor pending", () => {
    expect(canWriteSupplierEntity(importer, EXPORTER_ID, [importerLink(EXPORTER_ID, "revoked")])).toBe(false);
  });

  it("refuses an exporter linked to a different importer", () => {
    const otherTenant: SupplierLink = {
      relationship_type: "importer_supplier",
      status: "active",
      supplier_id: EXPORTER_ID,
      importer_id: "importer-2",
    };
    expect(canWriteSupplierEntity(importer, EXPORTER_ID, [otherTenant])).toBe(false);
  });

  it("refuses an exporter with no link at all", () => {
    expect(decideSupplierEntityAccess(importer, EXPORTER_ID, [])).toEqual({ allowed: false, reason: "no_link" });
  });

  it("does not treat an exporter_supplier link as an importer link", () => {
    // The old code looked only at exporter_supplier/self_supply, which is
    // precisely why the importer case fell through.
    expect(canWriteSupplierEntity(importer, UPSTREAM_ID, [exporterLink(UPSTREAM_ID)])).toBe(false);
  });
});

describe("exporter and supplier access", () => {
  it("allows an exporter to write its own record", () => {
    expect(decideSupplierEntityAccess(exporter, EXPORTER_ID, [])).toEqual({
      allowed: true,
      reason: "own_supplier",
    });
  });

  it("allows an exporter to write for a linked upstream supplier", () => {
    expect(canWriteSupplierEntity(exporter, UPSTREAM_ID, [exporterLink(UPSTREAM_ID)])).toBe(true);
  });

  it("allows a self_supply link", () => {
    const link: SupplierLink = {
      relationship_type: "self_supply",
      status: "active",
      supplier_id: UPSTREAM_ID,
      exporter_id: EXPORTER_ID,
    };
    expect(canWriteSupplierEntity(exporter, UPSTREAM_ID, [link])).toBe(true);
  });

  it("refuses an upstream supplier linked to a different exporter", () => {
    const other: SupplierLink = {
      relationship_type: "exporter_supplier",
      status: "active",
      supplier_id: UPSTREAM_ID,
      exporter_id: "supplier-other",
    };
    expect(canWriteSupplierEntity(exporter, UPSTREAM_ID, [other])).toBe(false);
  });

  it("never lets a null supplier_id match a null exporter_id", () => {
    // `exporter_id = null` matched nothing in SQL but would match in JS if the
    // guards were dropped, which would silently grant access to every actor
    // without a supplier record.
    const orphan: SupplierLink = {
      relationship_type: "exporter_supplier",
      status: "active",
      supplier_id: EXPORTER_ID,
      exporter_id: null,
    };
    expect(canWriteSupplierEntity(importer, EXPORTER_ID, [orphan])).toBe(false);
  });
});

describe("platform-wide actors", () => {
  it("allows an administrator with no links present", () => {
    expect(decideSupplierEntityAccess(admin, EXPORTER_ID, [])).toEqual({
      allowed: true,
      reason: "platform_wide",
    });
  });

  it("allows a reviewer holding no importer_id", () => {
    expect(canWriteSupplierEntity(platformReviewer, EXPORTER_ID, [])).toBe(true);
  });

  it("confines a reviewer that holds an importer_id to that tenant", () => {
    // 004_reviewer_tenancy.sql: a reviewer WITH an importer_id is one tenant's
    // qualified individual, not a platform-wide actor.
    expect(canWriteSupplierEntity(tenantReviewer, EXPORTER_ID, [])).toBe(false);
    expect(canWriteSupplierEntity(tenantReviewer, EXPORTER_ID, [importerLink(EXPORTER_ID)])).toBe(true);
  });
});

describe("firstDeniedSupplierId", () => {
  it("returns null when every supplier is permitted", () => {
    const links = [importerLink(EXPORTER_ID), importerLink(UPSTREAM_ID)];
    expect(firstDeniedSupplierId(importer, [EXPORTER_ID, UPSTREAM_ID], links)).toBeNull();
  });

  it("names the first supplier that is not permitted", () => {
    expect(firstDeniedSupplierId(importer, [EXPORTER_ID, UPSTREAM_ID], [importerLink(EXPORTER_ID)]))
      .toBe(UPSTREAM_ID);
  });

  it("ignores links belonging to other suppliers", () => {
    expect(canWriteSupplierEntity(importer, UPSTREAM_ID, [importerLink(EXPORTER_ID)])).toBe(false);
  });
});
