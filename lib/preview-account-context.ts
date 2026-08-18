import type { User } from "@supabase/supabase-js";
import { getPreviewSupplierId } from "@/lib/preview-role";
import type { AppRole } from "@/types/platform";

type AccountProfile = {
  supplier_id: string | null;
  importer_id: string | null;
  organization_name: string | null;
};

export type EffectiveAccountContext = {
  importerId: string | null;
  organizationName: string | null;
  profile: AccountProfile | null;
  supplierId: string | null;
};

export async function resolveEffectiveAccountContext({
  realRole,
  role,
  supabase,
  user,
}: {
  realRole: AppRole;
  role: AppRole;
  supabase: any;
  user: User;
}): Promise<EffectiveAccountContext> {
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, importer_id, organization_name")
    .eq("id", user.id)
    .maybeSingle();

  const ownProfile = (profile ?? null) as AccountProfile | null;

  if (realRole !== "administrator") {
    return {
      importerId: ownProfile?.importer_id ?? null,
      organizationName: ownProfile?.organization_name ?? null,
      profile: ownProfile,
      supplierId: ownProfile?.supplier_id ?? null,
    };
  }

  const previewAccountId = getPreviewSupplierId();
  if (!previewAccountId) {
    return {
      importerId: null,
      organizationName: null,
      profile: ownProfile,
      supplierId: null,
    };
  }

  if (role === "us_importer" || role === "reviewer") {
    const { data: importer } = await (supabase.from("importers") as any)
      .select("display_name, legal_name")
      .eq("id", previewAccountId)
      .maybeSingle();

    return {
      importerId: previewAccountId,
      organizationName: importer?.display_name ?? importer?.legal_name ?? null,
      profile: ownProfile,
      supplierId: null,
    };
  }

  if (role === "supplier" || role === "exporter") {
    const { data: supplier } = await (supabase.from("suppliers") as any)
      .select("company_name")
      .eq("id", previewAccountId)
      .maybeSingle();

    return {
      importerId: null,
      organizationName: supplier?.company_name ?? null,
      profile: ownProfile,
      supplierId: previewAccountId,
    };
  }

  return {
    importerId: null,
    organizationName: null,
    profile: ownProfile,
    supplierId: null,
  };
}
