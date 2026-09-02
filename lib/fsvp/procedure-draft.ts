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
  /** The address FSVP transmits with the identifier at entry (§ 1.509). */
  contactEmail: string | null;
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

/**
 * § 1.509 — the FSVP importer identifier transmitted at entry.
 *
 * The platform is the system of record for the identifier itself, so the draft
 * states it rather than asking. What it cannot know is the mechanics around it:
 * who transmits the identifier on the importer's behalf, and how the importer
 * satisfies itself that the number is still active. Both are left as review
 * passages, and a missing D-U-N-S becomes one too — a statement naming no
 * identifier would be worse than an unanswered question, because § 1.509 is
 * what attaches an otherwise complete FSVP to the shipment it was built for.
 */
export function draftImporterIdentification(facts: ProcedureFacts): ProcedureSection[] {
  return [
    {
      heading: "The identifier we transmit",
      body:
        facts.dunsNumber
          ? `${facts.organizationName} is the FSVP importer for the food it imports, and identifies ` +
            `itself at entry by D-U-N-S ${facts.dunsNumber}, transmitted with entity role code FSV ` +
            `as required by 21 CFR 1.509. The name transmitted with it is ` +
            `${facts.organizationName}` +
            (facts.contactEmail ? `, and the electronic mail address is ${facts.contactEmail}.` : `.`) +
            (facts.contactEmail
              ? ``
              : `\n\n[REVIEW: § 1.509 requires an electronic mail address to be transmitted with ` +
                `the name and D-U-N-S. Record the address your entries carry.]`)
          : `${facts.organizationName} is the FSVP importer for the food it imports and identifies ` +
            `itself at entry by D-U-N-S number, transmitted with entity role code FSV as required ` +
            `by 21 CFR 1.509.\n\n[REVIEW: no D-U-N-S number is recorded for this organization. ` +
            `Enter it in your organization's details, then rebuild this draft — a procedure that ` +
            `names no identifier cannot show which shipments your FSVP attaches to.]`,
    },
    {
      heading: "How it reaches CBP",
      body:
        `The identifier is transmitted electronically for each line of food subject to FSVP at the ` +
        `time of entry filing.\n\n[REVIEW: name who files entries on your behalf — your customs ` +
        `broker or self-filer — and how they are told which identifier to transmit. The platform ` +
        `holds the number; it does not file your entries.]`,
    },
    {
      heading: "Keeping it current",
      body:
        `The identifier is only useful while it is active and resolves to ` +
        `${facts.organizationName}.\n\n[REVIEW: state how and how often you confirm the D-U-N-S ` +
        `is still active and its registered details still correct, and who is responsible for ` +
        `doing so.]`,
    },
    {
      heading: "When it changes",
      body:
        `A change of identifier — a new D-U-N-S, a change of legal name, a change of the address ` +
        `transmitted with it — is recorded with the date it takes effect, and entries filed from ` +
        `that date carry the new identifier. The previous identifier is retained rather than ` +
        `overwritten, so it stays possible to say which identifier a past entry was filed under.`,
    },
    {
      heading: "Records",
      body:
        `Records made under this procedure are signed and dated, retained for ${facts.retentionYears} ` +
        `years after the date they were last relied on, kept in English, and made available to FDA ` +
        `promptly on request (21 CFR 1.510).`,
    },
  ];
}

/**
 * § 1.504(a) — reviewing and assessing a hazard analysis conducted by someone else.
 *
 * The one draft here that asserts almost nothing. FSVP lets an importer rely on
 * an analysis another entity conducted, but the platform has no way to know
 * whether this importer does, whose analysis it is, or what reviewing it found
 * — those facts live entirely outside. So this is a form rather than a
 * description: the structure § 1.504(a) expects, with the substance left to the
 * qualified individual who actually did the review. Generating it does not
 * assert that the importer relies on anyone; adopting it does.
 */
export function draftHazardAnalysisReliance(facts: ProcedureFacts): ProcedureSection[] {
  const qiNames = facts.qualifiedIndividuals.map((q) => q.name);

  return [
    {
      heading: "When this record applies",
      body:
        `21 CFR 1.504(a) permits ${facts.organizationName} to rely on a hazard analysis conducted ` +
        `by another entity — a foreign supplier, a co-packer, or a third party — provided it ` +
        `reviews and assesses that analysis and documents having done so. This record exists ` +
        `because ${facts.organizationName} relies on such an analysis for at least one food. Where ` +
        `${facts.organizationName} conducts its own hazard analysis, this record does not apply and ` +
        `should not be adopted.`,
    },
    {
      heading: "The analysis we rely on",
      body:
        `[REVIEW: name the entity that conducted the hazard analysis, the food or foods it covers, ` +
        `the date of the analysis and the version or document reference you were given. If you ` +
        `rely on more than one, list each.]`,
    },
    {
      heading: "Our review and assessment",
      body:
        (qiNames.length > 0
          ? `The review is performed or overseen by a qualified individual on ` +
            `${facts.organizationName}'s register — currently ${list(qiNames)} — as § 1.503 ` +
            `requires of the § 1.504 determination itself.\n\n`
          : `No qualified individual is currently on ${facts.organizationName}'s register. ` +
            `§ 1.503 requires the § 1.504 determination to be performed or overseen by one, so ` +
            `the register must be completed before this record can be adopted.\n\n`) +
        `[REVIEW: state who carried out the review, when, and what they assessed — whether the ` +
        `analysis covers the known and reasonably foreseeable hazards for this food, whether the ` +
        `severity and probability judgements are supported, and whether the controls it identifies ` +
        `match what your supplier evaluation found. Record the conclusion you reached, including ` +
        `anything you did not accept.]`,
    },
    {
      heading: "What we do not rely on it for",
      body:
        `Relying on another entity's hazard analysis does not transfer responsibility. ` +
        `${facts.organizationName} remains responsible for the § 1.505 foreign supplier evaluation ` +
        `and the § 1.506(d) determination of appropriate verification activities, and makes both ` +
        `itself.`,
    },
    {
      heading: "When we review it again",
      body:
        `The analysis is reviewed again when it is revised, when the food or its process changes, ` +
        `and at the reassessment of the supplier approval that relies on it (21 CFR 1.508). New ` +
        `information about a hazard in the food triggers a review before that date.`,
    },
    {
      heading: "Records",
      body:
        `The analysis relied on and the record of this review are retained for ${facts.retentionYears} ` +
        `years after the date they were last relied on, kept in English, and made available to FDA ` +
        `promptly on request (21 CFR 1.510). The analysis itself is filed alongside this record as ` +
        `the document it assesses.`,
    },
  ];
}

/**
 * Which obligations are written records rather than uploaded files, and how
 * each one is drafted.
 *
 * One map because three places have to agree: the API route that generates,
 * the /our-records page that offers an editor instead of a file picker, and
 * the kind CHECK on importer_procedures (migration 027). Two of those are code
 * and can import this; the constraint cannot, so it is the one to update by
 * hand when a kind is added here.
 *
 * qi_qualifications is deliberately absent. A qualified individual's CV is
 * external evidence about a person — the platform is not its system of record
 * and cannot draft one — so it stays an upload.
 */
export const PROCEDURE_DRAFTERS: Record<string, (facts: ProcedureFacts) => ProcedureSection[]> = {
  approved_supplier_procedures: draftApprovedSupplierProcedure,
  records_procedures:           draftRecordsProcedure,
  importer_identification:      draftImporterIdentification,
  hazard_analysis_reliance:     draftHazardAnalysisReliance,
};

/** The obligation keys held as editable procedures. */
export const PROCEDURE_KINDS = Object.keys(PROCEDURE_DRAFTERS);

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
