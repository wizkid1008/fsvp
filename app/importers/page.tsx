import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { requireProfileRole } from "@/lib/auth/protection";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

/**
 * The importer organizations themselves.
 *
 * Nothing in the app listed these. `importers` rows were only ever read one at
 * a time — to approve an account, to resolve a preview target, or to stamp a
 * report header — so an administrator could see importer USERS in the admin
 * panel's profile table but never the tenants they belong to, and had no way to
 * find an importer with no users yet.
 */

type ImporterRow = {
  id: string;
  legal_name: string;
  display_name: string;
  ein: string | null;
  duns_number: string | null;
  food_scope: string;
  status: string;
  primary_contact_email: string | null;
  created_at: string;
};

function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "suspended") return "danger";
  return "neutral";
}

export default async function ImportersPage() {
  const { role, realRole } = await requireProfileRole("/importers", ["administrator", "reviewer"]);

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Importers" description="" />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }

  const [{ data: rawImporters }, { data: rawProfiles }, { data: rawSuppliers }] = await Promise.all([
    (adminResult.client.from("importers") as any)
      .select("id, legal_name, display_name, ein, duns_number, food_scope, status, primary_contact_email, created_at")
      .order("display_name"),
    (adminResult.client.from("profiles") as any)
      .select("importer_id")
      .not("importer_id", "is", null),
    (adminResult.client.from("supplier_relationships") as any)
      .select("importer_id, supplier_id")
      .eq("relationship_type", "importer_supplier")
      .in("status", ["active", "pending_invite"]),
  ]);

  const importers = (rawImporters ?? []) as ImporterRow[];

  const usersByImporter = new Map<string, number>();
  for (const row of (rawProfiles ?? []) as Array<{ importer_id: string | null }>) {
    if (!row.importer_id) continue;
    usersByImporter.set(row.importer_id, (usersByImporter.get(row.importer_id) ?? 0) + 1);
  }

  const exportersByImporter = new Map<string, Set<string>>();
  for (const row of (rawSuppliers ?? []) as Array<{ importer_id: string | null; supplier_id: string | null }>) {
    if (!row.importer_id || !row.supplier_id) continue;
    const existing = exportersByImporter.get(row.importer_id) ?? new Set<string>();
    existing.add(row.supplier_id);
    exportersByImporter.set(row.importer_id, existing);
  }

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Importers"
        description="Every U.S. importing organization on the platform. An importer with no users has been created but never claimed."
      />

      {importers.length === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink">No importer organizations yet</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            An importer organization is created when an administrator approves an importer signup.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Importer</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">EIN</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">D-U-N-S</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Food scope</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Users</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Exporters</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {importers.map((importer) => {
                const users = usersByImporter.get(importer.id) ?? 0;
                return (
                  <tr key={importer.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{importer.display_name}</p>
                      {importer.legal_name !== importer.display_name && (
                        <p className="text-xs text-slate-500">{importer.legal_name}</p>
                      )}
                      {importer.primary_contact_email && (
                        <p className="text-xs text-slate-400">{importer.primary_contact_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{importer.ein ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{importer.duns_number ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{importer.food_scope}</td>
                    <td className="px-4 py-3">
                      {users === 0
                        ? <StatusBadge tone="warning">Unclaimed</StatusBadge>
                        : <span className="text-slate-600">{users}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {exportersByImporter.get(importer.id)?.size ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone(importer.status)}>{importer.status}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
