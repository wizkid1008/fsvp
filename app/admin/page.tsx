import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function AdminPage() {
  return <ModulePage config={moduleConfigs.admin} />;
}
