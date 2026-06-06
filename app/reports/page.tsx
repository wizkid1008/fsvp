import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";
import { requireProfileRole } from "@/lib/auth/protection";

export const runtime = "edge";

export default async function ReportsPage() {
  const { role } = await requireProfileRole("/reports");
  return <ModulePage config={moduleConfigs.reports} role={role} />;
}
