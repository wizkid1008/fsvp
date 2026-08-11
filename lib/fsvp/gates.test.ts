import { describe, expect, it } from "vitest";
import { evaluateGates, isSuspensionBasis, SUSPENSION_BASES, type GateContext } from "./gates";

const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

type Fixture = {
  supplier_suspensions?: unknown;
  verification_determinations?: unknown;
  written_assurances?: unknown[];
  supplier_compliance_screenings?: unknown;
};

/**
 * Minimal stand-in for the PostgREST builder: chainable, resolves to a single
 * row via maybeSingle() and to a list when awaited directly.
 */
function fakeDb(fixture: Fixture) {
  return {
    from(table: string) {
      const single = (fixture as Record<string, unknown>)[table] ?? null;
      const list = (fixture as Record<string, unknown[]>)[table] ?? [];

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve({ data: single }),
        then: (resolve: (v: unknown) => void) => resolve({ data: list }),
      };
      return builder;
    },
  };
}

function ctx(over: Partial<GateContext> = {}): GateContext {
  return {
    importerId: "imp-1",
    supplierId: "sup-1",
    fsvpRecordId: "rec-1",
    outcome: "in_scope",
    ...over,
  };
}

/** A fixture that clears every gate, so each test can break exactly one thing. */
function clean(): Fixture {
  return {
    supplier_suspensions: null,
    verification_determinations: {
      id: "vd-1",
      activities: ["records_review"],
      sahcodha_hazard_present: false,
      controlled_by_foreign_supplier: false,
      annual_onsite_audit_performed: false,
      alternative_justification: null,
      determined_at: "2026-01-01T00:00:00Z",
    },
    written_assurances: [],
    supplier_compliance_screenings: {
      id: "scr-1",
      conclusion: "no_adverse_history",
      expires_at: TOMORROW,
      screened_at: "2026-01-01T00:00:00Z",
    },
  };
}

async function codes(fixture: Fixture, context = ctx()): Promise<string[]> {
  const blocks = await evaluateGates(fakeDb(fixture) as any, context);
  return blocks.map((b) => b.code);
}

describe("evaluateGates", () => {
  it("passes a record with everything in order", async () => {
    expect(await codes(clean())).toEqual([]);
  });

  it("returns every blocker at once, not the first", async () => {
    // Fixing one blocker at a time and discovering the next only after
    // resubmitting is how a compliance queue becomes a war of attrition.
    const found = await codes({
      supplier_suspensions: { basis: "commercial", reason: "Terms lapsed.", suspended_at: "2026-01-01" },
      verification_determinations: null,
      written_assurances: [],
      supplier_compliance_screenings: null,
    });
    expect(found).toContain("supplier_suspended");
    expect(found).toContain("verification_determination_missing");
    expect(found).toContain("compliance_screening_missing");
    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});

describe("suspension", () => {
  it("blocks regardless of how FSVP applies to the food", async () => {
    // Suspending a supplier and approving their record the same day is
    // incoherent whichever requirements the food is subject to.
    for (const outcome of ["in_scope", "modified", "exempt", null] as const) {
      const found = await codes(
        { ...clean(), supplier_suspensions: { basis: "regulatory_finding", reason: "Class I recall confirmed.", suspended_at: "2026-01-01" } },
        ctx({ outcome })
      );
      expect(found).toContain("supplier_suspended");
    }
  });

  it("quotes the reason, so the block can be acted on", async () => {
    const blocks = await evaluateGates(
      fakeDb({ ...clean(), supplier_suspensions: { basis: "evidence_lapsed", reason: "Audit certificate expired.", suspended_at: "2026-01-01" } }) as any,
      ctx()
    );
    const msg = blocks.find((b) => b.code === "supplier_suspended")!.message;
    expect(msg).toContain("Audit certificate expired.");
    expect(msg).toContain("evidence lapsed");
  });
});

describe("§ 1.506(d) verification determination", () => {
  it("is required for an in-scope food", async () => {
    expect(await codes({ ...clean(), verification_determinations: null }))
      .toContain("verification_determination_missing");
  });

  it("is NOT required under modified requirements", async () => {
    // § 1.512 replaces this work with written assurance; demanding it would be
    // asking for something the regulation does not require.
    expect(
      await codes({ ...clean(), verification_determinations: null }, ctx({ outcome: "modified" }))
    ).not.toContain("verification_determination_missing");
  });

  it("blocks a SAHCODHA hazard with neither an audit nor a justification", async () => {
    const found = await codes({
      ...clean(),
      verification_determinations: {
        id: "vd-2",
        activities: ["records_review"],
        sahcodha_hazard_present: true,
        controlled_by_foreign_supplier: true,
        annual_onsite_audit_performed: false,
        alternative_justification: null,
        determined_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(found).toContain("sahcodha_audit_unjustified");
  });

  it("accepts a SAHCODHA hazard covered by the annual audit", async () => {
    const found = await codes({
      ...clean(),
      verification_determinations: {
        id: "vd-3",
        activities: ["onsite_audit"],
        sahcodha_hazard_present: true,
        controlled_by_foreign_supplier: true,
        annual_onsite_audit_performed: true,
        alternative_justification: null,
        determined_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(found).not.toContain("sahcodha_audit_unjustified");
  });

  it("accepts a written justification in place of the audit", async () => {
    const found = await codes({
      ...clean(),
      verification_determinations: {
        id: "vd-4",
        activities: ["sampling_testing"],
        sahcodha_hazard_present: true,
        controlled_by_foreign_supplier: true,
        annual_onsite_audit_performed: false,
        alternative_justification: "Lot-by-lot testing at port with third-party lab.",
        determined_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(found).not.toContain("sahcodha_audit_unjustified");
  });

  it("does not accept whitespace as a justification", async () => {
    const found = await codes({
      ...clean(),
      verification_determinations: {
        id: "vd-5",
        activities: ["sampling_testing"],
        sahcodha_hazard_present: true,
        controlled_by_foreign_supplier: true,
        annual_onsite_audit_performed: false,
        alternative_justification: "   ",
        determined_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(found).toContain("sahcodha_audit_unjustified");
  });

  it("does not fire when the supplier does not control the hazard", async () => {
    const found = await codes({
      ...clean(),
      verification_determinations: {
        id: "vd-6",
        activities: ["records_review"],
        sahcodha_hazard_present: true,
        controlled_by_foreign_supplier: false,
        annual_onsite_audit_performed: false,
        alternative_justification: null,
        determined_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(found).not.toContain("sahcodha_audit_unjustified");
  });
});

describe("§ 1.505(a)(1)(iv) compliance screening", () => {
  it("blocks when no screening has been recorded", async () => {
    // Holding FDA data is not the same as having considered it.
    expect(await codes({ ...clean(), supplier_compliance_screenings: null }))
      .toContain("compliance_screening_missing");
  });

  it("blocks an expired screening and names the date", async () => {
    const blocks = await evaluateGates(
      fakeDb({
        ...clean(),
        supplier_compliance_screenings: {
          id: "scr-2", conclusion: "no_adverse_history", expires_at: YESTERDAY, screened_at: "2025-01-01T00:00:00Z",
        },
      }) as any,
      ctx()
    );
    const block = blocks.find((b) => b.code === "compliance_screening_expired")!;
    expect(block.message).toContain(YESTERDAY);
  });

  it("blocks when the screener concluded the history is blocking", async () => {
    expect(
      await codes({
        ...clean(),
        supplier_compliance_screenings: {
          id: "scr-3", conclusion: "adverse_history_blocking", expires_at: TOMORROW, screened_at: "2026-01-01T00:00:00Z",
        },
      })
    ).toContain("compliance_screening_blocking");
  });

  it("accepts adverse history the screener judged acceptable", async () => {
    // The whole point of the three-way conclusion: findings do not
    // automatically block, a qualified individual decides.
    expect(
      await codes({
        ...clean(),
        supplier_compliance_screenings: {
          id: "scr-4", conclusion: "adverse_history_accepted", expires_at: TOMORROW, screened_at: "2026-01-01T00:00:00Z",
        },
      })
    ).toEqual([]);
  });

  it("is NOT required under modified requirements or for an exempt food", async () => {
    for (const outcome of ["modified", "exempt"] as const) {
      const found = await codes(
        { ...clean(), supplier_compliance_screenings: null },
        ctx({ outcome })
      );
      expect(found).not.toContain("compliance_screening_missing");
    }
  });

  it("treats a screening with no expiry as still current", async () => {
    expect(
      await codes({
        ...clean(),
        supplier_compliance_screenings: {
          id: "scr-5", conclusion: "no_adverse_history", expires_at: null, screened_at: "2026-01-01T00:00:00Z",
        },
      })
    ).toEqual([]);
  });
});

describe("SUSPENSION_BASES", () => {
  it("matches what the database check constraint allows", async () => {
    expect(SUSPENSION_BASES.map((b) => b.basis)).toEqual([
      "verification_failure",
      "corrective_action_open",
      "regulatory_finding",
      "evidence_lapsed",
      "commercial",
      "other",
    ]);
  });

  it("rejects anything not in the list", () => {
    expect(isSuspensionBasis("commercial")).toBe(true);
    expect(isSuspensionBasis("because_i_said_so")).toBe(false);
    expect(isSuspensionBasis(undefined)).toBe(false);
  });
});
