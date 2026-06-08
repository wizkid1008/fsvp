import { AppShell } from "@/components/layout/AppShell";
import { SupplierReadinessPanel } from "@/components/readiness/SupplierReadinessPanel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";

export const runtime = "edge";

export default async function MyReadinessPage() {
  const { role, supabase } = await requireProfileRole("/my-readiness", ["supplier", "administrator"]);

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Readiness"
        description="See how your records and submitted evidence track against FSVP requirements."
      />
      <div className="mt-6">
        <SupplierReadinessPanel supabase={supabase} />
      </div>
    </AppShell>
  );
}
