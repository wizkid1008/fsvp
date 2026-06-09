import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AcceptInviteClient } from "./AcceptInviteClient";

export const runtime = "edge";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";

  if (!token) {
    redirect("/dashboard");
  }

  // Look up the invite server-side
  const supabase = createServerSupabaseClient();

  const { data: link } = await (supabase.from("exporter_supplier_links") as any)
    .select(`
      id, status, invite_email,
      exporter:exporter_id ( company_name ),
      supplier:supplier_id ( company_name )
    `)
    .eq("invite_token", token)
    .maybeSingle();

  // Already accepted — go to dashboard
  if (link?.status === "active") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <AcceptInviteClient
        token={token}
        exporterName={link?.exporter?.company_name ?? "an exporter"}
        supplierName={link?.supplier?.company_name ?? "your company"}
        valid={Boolean(link && link.status === "pending_invite")}
      />
    </div>
  );
}
