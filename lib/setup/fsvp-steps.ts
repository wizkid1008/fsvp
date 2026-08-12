/**
 * The canonical FSVP journey — the ONE list of what an importer has to do, in
 * order, and the single source of truth for every screen that describes it.
 *
 * The onboarding modal used to carry its own seven-step list that never
 * mentioned applicability, admissibility, compliance screening, QI attestation
 * or the inspection package. A new importer was therefore taught a journey the
 * rest of the app would refuse to let them finish. Anything that narrates the
 * process now reads this array instead of restating it.
 *
 * Kept in its own module, with no imports, because the onboarding modal is a
 * client component: importing it from fsvp-workflow.ts would drag the whole
 * planner — and its Supabase query layer — into the browser bundle.
 */
export const FSVP_SETUP_STEPS = [
  {
    id: "exporter",
    title: "Create exporter",
    description: "Start with the foreign exporter your organization imports from.",
    href: "/exporters",
    actionLabel: "Open exporters",
  },
  {
    id: "facility",
    title: "Add facility",
    description: "Identify the facility that manufactures, packs, holds, or handles the food.",
    href: "/facilities",
    actionLabel: "Open facilities",
  },
  {
    id: "product",
    title: "Create product",
    description: "Create the food item and tie it to the correct exporter and facility.",
    href: "/products",
    actionLabel: "Open products",
  },
  {
    id: "classification",
    title: "Classify product",
    description: "Record commodity taxonomy and origin so admissibility can be determined.",
    href: "/products",
    actionLabel: "Review classifications",
  },
  {
    id: "admissibility",
    title: "Determine admissibility",
    description: "Snapshot whether the commodity may enter from its recorded origin.",
    href: "/products",
    actionLabel: "Open products",
  },
  {
    id: "record",
    title: "Open FSVP record",
    description: "Determine whether FSVP applies, then open the importer-owned record when it does.",
    href: "/fsvp-records",
    actionLabel: "Open records",
  },
  {
    id: "screening",
    title: "Screen compliance history",
    description: "A qualified individual records consideration of FDA compliance history.",
    href: "/compliance-history",
    actionLabel: "Open compliance history",
  },
  {
    id: "evidence",
    title: "Review evidence",
    description: "Attach accepted exporter documents to the record so the basis for approval is inspectable.",
    href: "/importer-review",
    actionLabel: "Review submissions",
  },
  {
    id: "qi",
    title: "Complete QI attestations",
    description: "Current qualified individual signatures must cover the required determinations.",
    href: "/qualified-individuals",
    actionLabel: "Open QI register",
  },
  {
    id: "approval",
    title: "Approve FSVP record",
    description: "Record the importer's approval decision only after the gates are clear.",
    href: "/fsvp-records",
    actionLabel: "Open records",
  },
  {
    id: "package",
    title: "Generate inspection package",
    description: "Assemble the printable record package used during an FDA records request.",
    href: "/reports",
    actionLabel: "Open reports",
  },
] as const;

export type FsvpSetupStepId = (typeof FSVP_SETUP_STEPS)[number]["id"];

export const FSVP_SETUP_STEP_COPY = Object.fromEntries(
  FSVP_SETUP_STEPS.map((step) => [step.id, step])
) as Record<FsvpSetupStepId, (typeof FSVP_SETUP_STEPS)[number]>;
