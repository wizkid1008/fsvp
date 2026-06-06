import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";
import { requireProfileRole } from "@/lib/auth/protection";

export const runtime = "edge";

export default async function ReviewerPage() {
  const { role } = await requireProfileRole("/reviewer", ["reviewer", "administrator"]);
  return <ModulePage config={moduleConfigs.reviewer} role={role} />;
}
