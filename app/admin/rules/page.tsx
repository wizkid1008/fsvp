import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CloneVersionButton } from "@/components/admin/rules/RuleVersionActions";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function versionTone(status: string): StatusTone {
  if (status === "published") return "success";
  if (status === "draft") return "info";
  return "neutral";
}

export default async function AdminRulesPage() {
  const { supabase, role } = await requireProfileRole("/admin/rules", ["administrator"]);

  const { data: rawRuleSets } = await (supabase.from("rule_sets") as any)
    .select(`
      id, set_name, description, applies_to, created_at,
      rule_versions (
        id, version_number, status, published_at, archived_at, notes, created_at
      )
    `)
    .order("created_at", { ascending: true });

  const ruleSets = (rawRuleSets ?? []) as Array<{
    id: string;
    set_name: string;
    description: string | null;
    applies_to: string;
    created_at: string;
    rule_versions: Array<{
      id: string;
      version_number: number;
      status: "draft" | "published" | "archived";
      published_at: string | null;
      archived_at: string | null;
      notes: string | null;
      created_at: string;
    }>;
  }>;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Rules Engine"
        description="Manage compliance rule sets, scoring weights, requirement items, and approval thresholds. Published versions are locked — clone to create a new draft."
        actionSlot={
          <Link href="/admin" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            ← Back to Admin
          </Link>
        }
      />

      {ruleSets.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft">
            <BookOpen className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">No rule sets found</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Run migration 021 to seed the default FSVP Standard rule set.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {ruleSets.map((ruleSet) => {
            const versions = [...(ruleSet.rule_versions ?? [])].sort(
              (a, b) => b.version_number - a.version_number
            );
            const publishedVersion = versions.find((v) => v.status === "published");

            return (
              <section key={ruleSet.id} className="rounded-lg border border-line bg-white shadow-soft">
                <div className="flex items-start justify-between border-b border-line px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-ink">{ruleSet.set_name}</h2>
                      <StatusBadge tone="neutral">
                        {ruleSet.applies_to === "all" ? "Facility + Product" : ruleSet.applies_to}
                      </StatusBadge>
                    </div>
                    {ruleSet.description && (
                      <p className="mt-1 text-sm text-slate-500">{ruleSet.description}</p>
                    )}
                  </div>
                  {publishedVersion && (
                    <CloneVersionButton versionId={publishedVersion.id} />
                  )}
                </div>

                {versions.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-400">No versions yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-slate-50">
                        <th className="px-5 py-2.5 text-left font-semibold text-slate-600">Version</th>
                        <th className="px-5 py-2.5 text-left font-semibold text-slate-600">Status</th>
                        <th className="px-5 py-2.5 text-left font-semibold text-slate-600">Notes</th>
                        <th className="px-5 py-2.5 text-left font-semibold text-slate-600">Published</th>
                        <th className="px-5 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {versions.map((ver) => (
                        <tr key={ver.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-semibold text-ink">v{ver.version_number}</td>
                          <td className="px-5 py-3">
                            <StatusBadge tone={versionTone(ver.status)}>
                              {ver.status.charAt(0).toUpperCase() + ver.status.slice(1)}
                            </StatusBadge>
                          </td>
                          <td className="px-5 py-3 text-slate-500">{ver.notes ?? "—"}</td>
                          <td className="px-5 py-3 text-slate-500">
                            {ver.published_at
                              ? new Date(ver.published_at).toLocaleDateString()
                              : ver.status === "draft"
                                ? "Not yet published"
                                : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link
                              href={`/admin/rules/${ver.id}`}
                              className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              {ver.status === "draft" ? "Edit Draft" : "View"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-line p-5">
        <div className="flex items-center gap-3">
          <Plus className="h-5 w-5 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-ink">Want to create a new rule set?</p>
            <p className="text-sm text-slate-500">
              New rule sets require a database migration to seed the initial version. Clone an existing version to edit weights and requirements without a migration.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
