import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";
import { requireProfileRole } from "@/lib/auth/protection";

export const runtime = "edge";

export default async function AuditLogPage() {
  const { role } = await requireProfileRole("/audit-log", ["reviewer", "administrator"]);
  return <ModulePage config={moduleConfigs["audit-log"]} role={role} />;
}
