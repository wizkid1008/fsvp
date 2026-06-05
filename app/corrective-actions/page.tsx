import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function CorrectiveActionsPage() {
  return <ModulePage config={moduleConfigs["corrective-actions"]} />;
}
