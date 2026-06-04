import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function SupplierPage() {
  return <ModulePage config={moduleConfigs.supplier} />;
}
