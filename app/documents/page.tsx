import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function DocumentsPage() {
  return <ModulePage config={moduleConfigs.documents} />;
}
