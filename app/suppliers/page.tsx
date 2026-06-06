import { getCurrentProfileRole, WorkflowPage } from "@/components/WorkflowPage";

export const runtime = "edge";

export default async function SuppliersPage() {
  const role = await getCurrentProfileRole();

  return (
    <WorkflowPage
      role={role}
      title="Suppliers"
      description="Start with the foreign supplier company profile, contacts, certifications, FDA registration, and importer relationship."
      primaryAction="Add supplier"
      cards={[
        {
          title: "Supplier Intake",
          description: "Capture the supplier legal entity, contacts, export markets, certifications, and FSVP relationship.",
          items: ["Legal entity", "Primary contacts", "Export markets", "FDA registration"]
        },
        {
          title: "Supplier Evidence Snapshot",
          description: "Jump into the evidence and readiness areas once the supplier profile exists.",
          items: ["Supplier questionnaire", "Certifications", "Registration documents", "Ownership attestation"]
        }
      ]}
    />
  );
}
