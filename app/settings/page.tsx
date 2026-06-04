import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function SettingsPage() {
  return <ModulePage config={moduleConfigs.settings} />;
}
