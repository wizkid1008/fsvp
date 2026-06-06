import { getCurrentProfileRole, WorkflowPage } from "@/components/WorkflowPage";

export const runtime = "edge";

export default async function ReadinessPage() {
  const role = await getCurrentProfileRole();

  return (
    <WorkflowPage
      role={role}
      title="Readiness"
      description="Track the readiness score, open gaps, corrective actions, and next steps before generating reports."
      primaryAction="Start assessment"
      cards={[
        {
          title: "Gap Assessment",
          description: "Calculate readiness across supplier, product, facility, hazard analysis, verification, and recall categories.",
          items: ["Readiness score", "Critical gaps", "Evidence sources", "Recommended actions"]
        },
        {
          title: "Corrective Actions",
          description: "Create and close follow-up tasks for rejected evidence, missing records, and unresolved findings.",
          items: ["Issue owner", "Due date", "Closure evidence", "Escalation status"]
        },
        {
          title: "Reports",
          description: "Export the readiness, gap, and audit packets once the assessment is ready.",
          items: ["Readiness report", "Gap report", "Audit packet", "Evidence index"]
        }
      ]}
    />
  );
}
