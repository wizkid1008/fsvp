import { getCurrentProfileRole, WorkflowPage } from "@/components/WorkflowPage";

export const runtime = "edge";

export default async function EvidencePage() {
  const role = await getCurrentProfileRole("/evidence");

  return (
    <WorkflowPage
      role={role}
      title="Evidence"
      description="Use one evidence workflow for uploads, document versions, FSVP requirement mapping, reviewer status, and gap resolution."
      primaryAction="Upload evidence"
      cards={[
        {
          title: "Documents",
          description: "Upload and classify evidence, preserve versions, and track review status.",
          items: ["Evidence uploads", "Document versions", "Categories", "Review status"]
        },
        {
          title: "FSVP Mapping",
          description: "Map each document to the FSVP requirement it supports and track gap status.",
          items: ["Required evidence", "Uploaded evidence", "Reviewer decision", "Gap status"]
        }
      ]}
    />
  );
}
