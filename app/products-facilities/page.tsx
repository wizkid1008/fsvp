import { getCurrentProfileRole, WorkflowPage } from "@/components/WorkflowPage";

export default async function ProductsFacilitiesPage() {
  const role = await getCurrentProfileRole();

  return (
    <WorkflowPage
      role={role}
      title="Products & Facilities"
      description="Group product identity, commodity risk, and facility details together because those records describe what is being imported and where it is made."
      primaryAction="Add product"
      cards={[
        {
          title: "Products",
          description: "Track product records tied to suppliers, including ingredients, intended use, packaging, shelf life, and allergens.",
          href: "/products",
          action: "Open products",
          items: ["Ingredients", "Intended use", "Packaging", "Allergen details"]
        },
        {
          title: "Commodity Risk",
          description: "Run the commodity risk engine from the product context: hazards, origin, processing state, and verification activities.",
          href: "/commodities",
          action: "Assess risk",
          items: ["Known hazards", "Origin context", "Processing state", "Verification activities"]
        },
        {
          title: "Facilities",
          description: "Maintain manufacturing and storage facility records linked to the supplier and products.",
          href: "/facilities",
          action: "Open facilities",
          items: ["Facility address", "FDA registration", "Processes", "Certifications"]
        }
      ]}
    />
  );
}
