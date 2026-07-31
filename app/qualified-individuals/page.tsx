import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { QualifiedIndividualsClient, type QiRow, type TenantMember } from "@/components/qi/QualifiedIndividualsClient";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";

export const runtime = "edge";

export default async function QualifiedIndividualsPage() {
  const { role, realRole, user } = await requireProfileRole("/qualified-individuals", [
    "us_importer", "reviewer", "administrator",
  ]);
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  // profiles RLS exposes only the caller's own row, so both of these read
  // through the admin client with an explicit importer_id filter.
  const [{ data: rawQis }, { data: rawMembers }] = await Promise.all([
    importerId
      ? (admin.from("qualified_individuals") as any)
          .select("id, profile_id, qualification_basis, education, training, experience, languages, scope, active_from, active_to, created_at")
          .eq("importer_id", importerId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    importerId
      ? (admin.from("profiles") as any)
          .select("id, full_name, email, role, position")
          .eq("importer_id", importerId)
          .in("role", ["us_importer", "reviewer", "administrator"])
          .order("full_name")
      : Promise.resolve({ data: [] }),
  ]);

  const members = ((rawMembers ?? []) as TenantMember[]);
  const byId = new Map(members.map((m) => [m.id, m]));

  const qis: QiRow[] = ((rawQis ?? []) as Array<Omit<QiRow, "full_name" | "email">>).map((q) => ({
    ...q,
    full_name: byId.get(q.profile_id)?.full_name ?? null,
    email:     byId.get(q.profile_id)?.email ?? "",
  }));

  // Only people not already registered can be added.
  const registered = new Set(qis.map((q) => q.profile_id));
  const available  = members.filter((m) => !registered.has(m.id));

  const canManage = role === "us_importer" || role === "administrator";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Qualified Individuals"
        description={
          "21 CFR § 1.503 requires a qualified individual to perform or oversee your hazard analyses, " +
          "supplier evaluations and verification determinations, and § 1.510(b) requires those records to be " +
          "signed and dated. Everyone here can sign; an FSVP record cannot be approved until all three " +
          "determinations carry a current signature."
        }
      />
      <QualifiedIndividualsClient
        qis={qis}
        availableMembers={available}
        canManage={canManage}
        hasOrganization={Boolean(importerId)}
      />
    </AppShell>
  );
}
