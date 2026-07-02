import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Upload, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

function statusTone(s: string | null): StatusTone {
  if (s === "accepted")      return "success";
  if (s === "under_review")  return "info";
  if (s === "submitted")     return "warning";
  if (s === "needs_revision") return "danger";
  return "neutral";
}

function statusLabel(s: string | null): string {
  if (!s || s === "not_submitted") return "Not Submitted";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function OpenTasksSection({
  supplierId,
  supabase,
}: {
  supplierId: string | null;
  supabase: SupabaseLike;
}) {
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let facilityTasks: any[] = [];
  let productTasks:  any[] = [];

  if (pubVersion?.id && supplierId) {
    const [fSections, pSections, itemsRes, docsRes] = await Promise.all([
      (supabase.from("requirement_sections") as any)
        .select("id, section_name, sort_order")
        .eq("rule_version_id", pubVersion.id)
        .eq("applies_to", "facility")
        .order("sort_order"),

      (supabase.from("requirement_sections") as any)
        .select("id, section_name, sort_order")
        .eq("rule_version_id", pubVersion.id)
        .eq("applies_to", "product")
        .order("sort_order"),

      (supabase.from("requirement_sections") as any)
        .select("id, requirement_items(id, item_name, is_required, is_critical_blocker)")
        .eq("rule_version_id", pubVersion.id)
        .in("applies_to", ["facility", "product"]),

      (supabase.from("documents") as any)
        .select("requirement_item_id, evidence_status")
        .eq("supplier_id", supplierId)
        .is("soft_deleted_at", null)
        .not("requirement_item_id", "is", null),
    ]);

    type RawSec = { id: string; requirement_items: Array<{ id: string; item_name: string; is_required: boolean; is_critical_blocker: boolean }> };
    const itemsBySection = new Map<string, Array<{ id: string; item_name: string; is_critical_blocker: boolean }>>();
    for (const s of (itemsRes.data ?? []) as RawSec[]) {
      itemsBySection.set(s.id, (s.requirement_items ?? []).filter((i) => i.is_required));
    }

    const docByItem = new Map<string, string>();
    for (const d of (docsRes.data ?? []) as Array<{ requirement_item_id: string; evidence_status: string }>) {
      const existing = docByItem.get(d.requirement_item_id);
      if (!existing || existing === "not_submitted") docByItem.set(d.requirement_item_id, d.evidence_status);
    }

    function buildTasks(sections: any[]) {
      return sections.map((sec: any) => {
        const items = itemsBySection.get(sec.id) ?? [];
        const missing  = items.filter((i) => !docByItem.get(i.id) || docByItem.get(i.id) === "not_submitted");
        const critical = missing.filter((i) => i.is_critical_blocker);
        const accepted = items.filter((i) => docByItem.get(i.id) === "accepted").length;
        return { ...sec, items, missing, critical, accepted };
      }).filter((t: any) => t.missing.length > 0);
    }

    facilityTasks = buildTasks(fSections.data ?? []);
    productTasks  = buildTasks(pSections.data ?? []);
  }

  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  const { data: expiringDocs } = supplierId
    ? await (supabase.from("documents") as any)
        .select("id, title, expiration_date, evidence_status")
        .eq("supplier_id", supplierId)
        .is("soft_deleted_at", null)
        .not("expiration_date", "is", null)
        .lte("expiration_date", ninetyDays.toISOString().split("T")[0])
        .order("expiration_date")
    : { data: [] };

  const expiring = (expiringDocs ?? []) as Array<{
    id: string;
    title: string;
    expiration_date: string;
    evidence_status: string;
  }>;

  const totalMissing = facilityTasks.reduce((s: number, t: any) => s + t.missing.length, 0)
    + productTasks.reduce((s: number, t: any) => s + t.missing.length, 0);

  if (totalMissing === 0 && expiring.length === 0) return null;

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Open Tasks</h2>
        <p className="mt-0.5 text-xs text-slate-500">Missing evidence and expiring documents across your facilities and products.</p>
      </div>

      {expiring.length > 0 && (
        <div className="border-b border-line">
          <div className="bg-red-50 px-5 py-2">
            <p className="text-xs font-semibold text-red-800">Expiring Documents ({expiring.length})</p>
          </div>
          <div className="divide-y divide-line">
            {expiring.map((doc) => {
              const days = Math.ceil((new Date(doc.expiration_date).getTime() - Date.now()) / 86400000);
              return (
                <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <AlertCircle className={`h-4 w-4 shrink-0 ${days <= 30 ? "text-red-500" : "text-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{doc.title}</p>
                    <p className="text-xs text-slate-500">
                      Expires {new Date(doc.expiration_date).toLocaleDateString()} · {days} day{days !== 1 ? "s" : ""} left
                    </p>
                  </div>
                  <StatusBadge tone={statusTone(doc.evidence_status)}>
                    {statusLabel(doc.evidence_status)}
                  </StatusBadge>
                  <Link href="/my-evidence"
                    className="shrink-0 flex h-7 items-center gap-1 rounded-md border border-forest px-2.5 text-xs font-semibold text-forest hover:bg-emerald-50 transition">
                    <Upload className="h-3 w-3" /> Renew
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {facilityTasks.length > 0 && (
        <div className="border-b border-line">
          <div className="px-5 py-2">
            <p className="text-xs font-semibold text-slate-500">Missing Facility Evidence</p>
          </div>
          <div className="divide-y divide-line">
            {facilityTasks.map((task: any) => (
              <div key={task.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  {task.critical.length > 0
                    ? <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    : <Clock className="h-4 w-4 shrink-0 text-slate-300" />
                  }
                  <p className="text-sm font-semibold text-ink">{task.section_name}</p>
                  {task.critical.length > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Critical</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{task.accepted}/{task.items.length} accepted</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-slate-500">
                  Missing: {task.missing.map((i: any) => i.item_name).join(", ")}
                </p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3">
            <Link href="/facilities"
              className="flex items-center gap-1.5 text-xs font-semibold text-forest hover:underline">
              Go to Facilities to upload <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {productTasks.length > 0 && (
        <div>
          <div className="px-5 py-2">
            <p className="text-xs font-semibold text-slate-500">Missing Product Evidence</p>
          </div>
          <div className="divide-y divide-line">
            {productTasks.map((task: any) => (
              <div key={task.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  {task.critical.length > 0
                    ? <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    : <Clock className="h-4 w-4 shrink-0 text-slate-300" />
                  }
                  <p className="text-sm font-semibold text-ink">{task.section_name}</p>
                  {task.critical.length > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Critical</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">{task.accepted}/{task.items.length} accepted</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-slate-500">
                  Missing: {task.missing.map((i: any) => i.item_name).join(", ")}
                </p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3">
            <Link href="/products"
              className="flex items-center gap-1.5 text-xs font-semibold text-forest hover:underline">
              Go to Products to upload <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
