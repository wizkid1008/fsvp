import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function AuditLogPage() {
  return <ModulePage config={moduleConfigs["audit-log"]} />;
}
