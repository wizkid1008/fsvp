import { ModulePage } from "@/components/ModulePage";
import { moduleConfigs } from "@/data/platform";

export default function ProductsPage() {
  return <ModulePage config={moduleConfigs.products} />;
}
