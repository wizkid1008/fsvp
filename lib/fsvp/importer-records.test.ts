import { describe, expect, it } from "vitest";
import {
  IMPORTER_RECORD_KINDS,
  outstandingRequired,
  summariseImporterRecords,
} from "./importer-records";

const doc = (kind: string, status: string | null = "accepted") => ({
  document_kind: kind,
  evidence_status: status,
});

describe("IMPORTER_RECORD_KINDS", () => {
  it("cites a regulation for every obligation", () => {
    // These are claims about what the law requires. An uncited one is an
    // assertion nobody can check, which is the thing this platform is careful
    // not to make anywhere else either.
    for (const kind of IMPORTER_RECORD_KINDS) {
      expect(kind.citation, kind.title).toMatch(/^21 CFR 1\.\d+/);
      expect(kind.why.length, kind.title).toBeGreaterThan(40);
    }
  });

  it("marks hazard-analysis reliance as conditional, not required", () => {
    // § 1.504(a) only bites if you rely on someone else's analysis. Listing it
    // as required would make every importer who does their own look deficient.
    const reliance = IMPORTER_RECORD_KINDS.find((k) => k.key === "hazard_analysis_reliance");
    expect(reliance?.required).toBe(false);
  });

  it("has unique keys, since document_kind matches on them", () => {
    const keys = IMPORTER_RECORD_KINDS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("summariseImporterRecords", () => {
  it("reports nothing satisfied on an empty organization", () => {
    const summary = summariseImporterRecords([]);
    expect(summary).toHaveLength(IMPORTER_RECORD_KINDS.length);
    expect(summary.every((s) => !s.satisfied && s.documents === 0)).toBe(true);
  });

  it("counts documents against the obligation they answer", () => {
    const summary = summariseImporterRecords([
      doc("records_procedures"),
      doc("records_procedures"),
      doc("qi_qualifications"),
    ]);

    expect(summary.find((s) => s.kind.key === "records_procedures")?.documents).toBe(2);
    expect(summary.find((s) => s.kind.key === "qi_qualifications")?.documents).toBe(1);
    expect(summary.find((s) => s.kind.key === "importer_identification")?.documents).toBe(0);
  });

  it("does not treat an uploaded-but-unreviewed document as satisfying anything", () => {
    // Uploading is not the same as accepted. Elsewhere in this platform only
    // accepted evidence counts, and an importer's own records are no different.
    const summary = summariseImporterRecords([doc("records_procedures", "submitted")]);
    const record = summary.find((s) => s.kind.key === "records_procedures");

    expect(record?.documents).toBe(1);
    expect(record?.satisfied).toBe(false);
  });

  it("ignores a rejected document while still counting it as filed", () => {
    const summary = summariseImporterRecords([doc("qi_qualifications", "rejected")]);
    expect(summary.find((s) => s.kind.key === "qi_qualifications")?.satisfied).toBe(false);
  });

  it("is satisfied when any one document is accepted", () => {
    const summary = summariseImporterRecords([
      doc("qi_qualifications", "rejected"),
      doc("qi_qualifications", "accepted"),
    ]);
    expect(summary.find((s) => s.kind.key === "qi_qualifications")?.satisfied).toBe(true);
  });

  it("ignores documents filed under an unrecognised kind", () => {
    const summary = summariseImporterRecords([doc("something_else")]);
    expect(summary.every((s) => s.documents === 0)).toBe(true);
  });
});

describe("outstandingRequired", () => {
  it("counts only required obligations", () => {
    const summary = summariseImporterRecords([]);
    const required = IMPORTER_RECORD_KINDS.filter((k) => k.required).length;
    expect(outstandingRequired(summary)).toBe(required);
  });

  it("does not count the conditional one even when unfiled", () => {
    const summary = summariseImporterRecords([
      doc("approved_supplier_procedures"),
      doc("qi_qualifications"),
      doc("records_procedures"),
      doc("importer_identification"),
    ]);
    expect(outstandingRequired(summary)).toBe(0);
  });
});
