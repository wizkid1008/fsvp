import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function ReviewerPage() {
  return <ModulePage config={moduleConfigs.reviewer} />;
}
