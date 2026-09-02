/**
 * Drafting an importer's own FSVP procedures from what the platform enforces.
 *
 * Safe to generate for the same reason country-commodity rules are not: a rule
 * asserts what the LAW permits, and inventing one produces a confident wrong
 * answer about the outside world. A § 1.506(b) procedure asserts what THIS
 * COMPANY does — and the platform is already the system of record for that, so
 * a generated draft is a description of an enforced control rather than a claim
 * about anything external.
 *
 * The safeguard is adoption, not generation. FSVP requires you to FOLLOW your
 * written procedure, so a document describing the platform's workflow is false
 * wherever your real practice differs — a manual approval outside the system, a
 * second reviewer, a different escalation. A false procedure is worse than
 * none, because you are then non-compliant with your own stated process. So
 * nothing here files itself: a person reads it, reconciles it against what they
 * actually do, edits, and adopts. That adoption is the signature.
 */

export type ProcedureFacts = {
  organizationName: string;
  dunsNumber: string | null;
  foodScope: string;
  /** Names of qualified individuals currently active on the register. */
  qualifiedIndividuals: Array<{ name: string; basis: string | null }>;
  /** Distinct reassessment intervals in months actually in use. */
  reassessmentMonths: number[];
  /** How long evidence is retained, in years. */
  retentionYears: number;
};

/** A section of the drafted document. Kept structured so the editor can show
 *  headings rather than one wall of text, and so a diff is readable. */
export type ProcedureSection = { heading: string; body: string };

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * § 1.506(b) — written procedures for using approved foreign suppliers.
 *
 * Every factual claim traces to something the platform enforces or records. The
 * four approval conditions are the gates in /api/fsvp-records/[id]/approve, in
 * the order that route checks them.
 */
export function draftApprovedSupplierProcedure(facts: ProcedureFacts): ProcedureSection[] {
  const qiNames = facts.qualifiedIndividuals.map((q) => q.name);

  return [
    {
      heading: "Purpose and scope",
      body:
        `This procedure governs how ${facts.organizationName} ensures that food is imported only ` +
        `from foreign suppliers it has approved, as required by 21 CFR 1.506(b). It applies to all ` +
        `${facts.foodScope === "both" ? "human and animal" : facts.foodScope} food imported by ` +
        `${facts.organizationName}` +
        (facts.dunsNumber
          ? `, filed under D-U-N-S ${facts.dunsNumber} as the FSVP importer identifier at entry ` +
            `(21 CFR 1.509).`
          : `. The FSVP importer identifier transmitted at entry is recorded separately ` +
            `(21 CFR 1.509).`),
    },
    {
      heading: "Approving a foreign supplier",
      body:
        `Approval is recorded per foreign supplier, facility and product combination, against a ` +
        `specific version of the requirement set. A combination is approved only when all four of ` +
        `the following hold, each verified before the approval is accepted:\n\n` +
        `1. A current FSVP applicability determination exists for the food, recording whether it ` +
        `is in scope, subject to modified requirements, or exempt (21 CFR 1.501, 1.511–1.513). An ` +
        `expired determination is treated as absent.\n` +
        `2. A qualified individual has signed each determination the applicability outcome ` +
        `requires — the hazard analysis (§ 1.504), the foreign supplier evaluation (§ 1.505) and ` +
        `the determination of appropriate verification activities (§ 1.506(d)). A signature is ` +
        `void if the text it covers has since been edited.\n` +
        `3. No blocking condition is outstanding: the supplier is not suspended, the § 1.506(d) ` +
        `verification determination is recorded, any written assurance required under § 1.507 is ` +
        `current, and the supplier's FDA compliance history has been screened (§ 1.505(b)).\n` +
        `4. No unresolved critical gap remains in the evidence assessment, calculated at the time ` +
        `the approval decision is made rather than read from a stored value.`,
    },
    {
      heading: "Who may approve",
      body:
        qiNames.length > 0
          ? `The determinations required under §§ 1.504, 1.505 and 1.506(d) are performed or ` +
            `overseen by a qualified individual on ${facts.organizationName}'s register. The ` +
            `individuals currently on that register are ${list(qiNames)}. Each holds the ` +
            `education, training or experience required by § 1.503, evidenced in the records ` +
            `kept with the register.\n\n` +
            `The approval decision itself is made by ${facts.organizationName} as the FSVP ` +
            `importer. A qualified individual may perform and sign the underlying determinations ` +
            `without holding authority to approve.`
          : `No qualified individual is currently on ${facts.organizationName}'s register. ` +
            `§ 1.503 requires the determinations under §§ 1.504, 1.505 and 1.506(d) to be ` +
            `performed or overseen by one, so this section must be completed before this ` +
            `procedure can be adopted.`,
    },
    {
      heading: "Importing before approval is complete",
      body:
        `Food is not imported from an unapproved foreign supplier except on a temporary basis, ` +
        `and only where the food is subject to adequate verification before entry. Any such ` +
        `instance is recorded at the time with the reason, the verification relied on, and the ` +
        `date approval was subsequently completed or the supplier discontinued.` +
        `\n\n[REVIEW: describe who authorises a temporary import and what verification is treated ` +
        `as adequate. The platform cannot know this — it is a decision about your operation.]`,
    },
    {
      heading: "Reassessment",
      body:
        facts.reassessmentMonths.length > 0
          ? `Each approval carries a reassessment date set when the decision is recorded. The ` +
            `intervals currently in use are ${list(facts.reassessmentMonths.map((m) => `${m} months`))}. ` +
            `Reassessment is also triggered before that date by new information about a supplier's ` +
            `performance or the risk posed by the food, including a recall, an import refusal, or ` +
            `an adverse inspection finding (21 CFR 1.508).`
          : `Each approval carries a reassessment date set when the decision is recorded, and ` +
            `reassessment is triggered earlier by new information about a supplier's performance ` +
            `or the risk posed by the food (21 CFR 1.508). No approvals have yet been recorded, ` +
            `so no interval is in use.`,
    },
    {
      heading: "When verification is unsatisfactory",
      body:
        `Where verification activities, a reassessment, or new compliance information indicate ` +
        `that a foreign supplier is not producing food in compliance with applicable requirements, ` +
        `${facts.organizationName} promptly takes appropriate corrective action. That action, its ` +
        `basis and its outcome are recorded, and the supplier's approval is suspended where the ` +
        `finding warrants it. A suspended supplier's records cannot be approved while the ` +
        `suspension stands.`,
    },
    {
      heading: "Records",
      body:
        `Records made under this procedure are signed and dated, retained for ${facts.retentionYears} ` +
        `years after the date they were last relied on, kept in English, and made available to FDA ` +
        `promptly on request (21 CFR 1.510). Records held electronically remain accessible for the ` +
        `full retention period, and a record within its retention period cannot be deleted.`,
    },
  ];
}

/** § 1.510 — how records are made, signed, kept and produced. */
export function draftRecordsProcedure(facts: ProcedureFacts): ProcedureSection[] {
  return [
    {
      heading: "Scope",
      body:
        `This procedure governs how ${facts.organizationName} creates, signs, retains and produces ` +
        `the records required by the Foreign Supplier Verification Program (21 CFR 1.510).`,
    },
    {
      heading: "Signing and dating",
      body:
        `Every determination requiring a qualified individual's signature is signed at the point ` +
        `the determination is recorded, capturing who signed it and when. A signature covers the ` +
        `text as it stood at signing; if that text is later edited the signature is void and the ` +
        `determination must be signed again, so no record can appear covered by a signature that ` +
        `was given to different wording.`,
    },
    {
      heading: "Retention",
      body:
        `Records are retained for ${facts.retentionYears} years after the date they were last ` +
        `relied on — for supplier records, that is ${facts.retentionYears} years after ` +
        `${facts.organizationName} stops importing from that supplier. A record inside its ` +
        `retention period cannot be deleted; deletion is refused rather than merely discouraged.`,
    },
    {
      heading: "Availability",
      body:
        `Records are kept in English and are produced to FDA promptly on request. An inspection ` +
        `package can be generated for any approved FSVP record, assembling the record, its ` +
        `determinations, the accepted evidence relied on, and the signatures with their dates.`,
    },
    {
      heading: "Electronic records",
      body:
        `Records held electronically remain accessible and legible for the full retention period. ` +
        `\n\n[REVIEW: if you also keep paper originals, or use a system other than this platform ` +
        `for any FSVP record, describe where those are held and who is responsible for them.]`,
    },
  ];
}

/** Rendered for the editor and for storage — headings preserved. */
export function sectionsToText(sections: ProcedureSection[]): string {
  return sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
}

/** Passages a person must resolve before the draft is true of their operation. */
export function reviewMarkers(sections: ProcedureSection[]): string[] {
  return sections
    .filter((s) => s.body.includes("[REVIEW:"))
    .map((s) => s.heading);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolving the passages a person must answer
//
// A [REVIEW:] marker is the honest part of a generated draft — it is where the
// platform declines to invent a fact about your operation. But left as raw text
// in a textarea it is also the part that stalls: the marker sits somewhere in a
// scrolling document, adoption is refused until it is gone, and nothing says
// where to look. Parsed out, each one becomes a question with a place to write
// the answer, and answering it edits the document rather than describing an
// edit for someone else to make.
// ─────────────────────────────────────────────────────────────────────────────

/** One passage in a draft that the platform could not write for you. */
export type ReviewPrompt = {
  /** The marker exactly as it appears in the text, brackets included. */
  marker: string;
  /** What it asks you to supply, whitespace normalised for display. */
  prompt: string;
  /** The `## heading` the marker sits under, so you know what it is about. */
  section: string | null;
};

/**
 * Pull the outstanding review passages out of a draft, in document order.
 *
 * Reads the live text rather than the generated sections, because by the time
 * this matters the person has been editing: a marker they already answered is
 * gone from the text and must be gone from the list too.
 */
export function parseReviewPrompts(text: string): ReviewPrompt[] {
  const pattern = /\[REVIEW:\s*([^\]]*)\]/g;
  const found: ReviewPrompt[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const headings = text.slice(0, match.index).match(/^##\s+(.+)$/gm);
    found.push({
      marker: match[0],
      prompt: match[1].replace(/\s+/g, " ").trim(),
      section: headings?.length ? headings[headings.length - 1].replace(/^##\s+/, "").trim() : null,
    });
  }

  return found;
}

/**
 * Answer one review passage, returning the draft with the marker replaced.
 *
 * An empty answer strikes the passage out instead — "we keep no paper
 * originals" is a legitimate response to a marker that asks about them, and
 * the document should then say nothing rather than carry an instruction to the
 * reader. The whitespace that introduced the marker goes with it, so removing a
 * passage does not leave a hole in the prose around it.
 */
export function resolveReviewPrompt(text: string, marker: string, answer: string): string {
  const at = text.indexOf(marker);
  if (at === -1) return text;

  const written = answer.trim();
  if (written) return text.slice(0, at) + written + text.slice(at + marker.length);

  let start = at;
  while (start > 0 && /\s/.test(text[start - 1])) start -= 1;
  return text.slice(0, start) + text.slice(at + marker.length);
}
