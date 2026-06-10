import Link from "next/link";
import { CheckCircle2, AlertCircle, Clock, ArrowRight, Building2, Package, Warehouse, FileText, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

function scoreColor(score: number) {
  if (score >= 90) return "text-emerald-600";
  if (score >= 75) return "text-amber-500";
  if (score >= 50) return "text-orange-500";
  return "text-red-500";
}

function scoreTone(score: number): StatusTone {
  if (score >= 90) return "success";
  if (score >= 75) return "warning";
  return "danger";
}

export async function ExporterDashboard({
  supplierId,
  companyName,
  displayName,
  supabase,
}: {
  supplierId: string | null;
  companyName: string | null;
  displayName: string;
  supabase: SupabaseLike;
}) {
  const [
    corporateDocsRes,
    facilitiesRes,
    productsRes,
    upstreamRes,
    gapRes,
    pubVersionRes,
  ] = await Promise.all([
    // Corporate documents submitted
    supplierId
      ? (supabase.from("documents") as any)
          .select("id, evidence_status, requirement_item_id")
          .eq("supplier_id", supplierId)
          .eq("link_type", "supplier")
          .is("soft_deleted_at", null)
      : Promise.resolve({ data: [] }),

    supplierId
      ? (supabase.from("facilities_verify") as any)
          .select("id, facility_name, supplier_id")
          .eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),

    supplierId
      ? (supabase.from("products_verify") as any)
          .select("id, product_name, supplier_id")
          .eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),

    // Upstream suppliers
    supplierId
      ? (supabase.from("exporter_supplier_links") as any)
          .select("id, status, supplier:supplier_id(company_name, supplier_type)")
          .eq("exporter_id", supplierId)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),

    // Open action items (corrective actions)
    (supabase.from("corrective_actions") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),

    // Published rule version for score
    (supabase.from("rule_versions") as any)
      .select("id")
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const corpDocs   = (corporateDocsRes.data ?? []) as Array<{ evidence_status: string }>;
  const facilities = (facilitiesRes.data ?? []) as Array<{ id: string; facility_name: string }>;
  const products   = (productsRes.data ?? []) as Array<{ id: string; product_name: string }>;
  const upstream   = (upstreamRes.data ?? []) as Array<{ id: string; supplier: { company_name: string; supplier_type: string } | null }>;

  const corpAccepted  = corpDocs.filter((d) => d.evidence_status === "accepted").length;
  const corpSubmitted = corpDocs.filter((d) => d.evidence_status === "submitted" || d.evidence_status === "under_review").length;

  // Readiness score from scoring engine
  let readinessScore = 0;
  if (pubVersionRes.data?.id && supplierId) {
    const [sectionsRes, weightsRes, itemsRes, docsRes] = await Promise.all([
      (supabase.from("requirement_sections") as any)
        .select("id, section_key")
        .eq("rule_version_id", pubVersionRes.data.id)
        .eq("applies_to", "supplier"),
      (supabase.from("scoring_category_weights") as any)
        .select("section_id, weight_percent")
        .eq("rule_version_id", pubVersionRes.data.id),
      (supabase.from("requirement_sections") as any)
        .select("id, requirement_items(id, is_required, is_critical_blocker)")
        .eq("rule_version_id", pubVersionRes.data.id)
        .eq("applies_to", "supplier"),
      (supabase.from("documents") as any)
        .select("requirement_item_id, evidence_status")
        .eq("supplier_id", supplierId)
        .is("soft_deleted_at", null)
        .not("requirement_item_id", "is", null),
    ]);

    const weightMap = new Map(
      ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
        .map((w) => [w.section_id, Number(w.weight_percent)])
    );
    const docByItem = new Map<string, string[]>();
    for (const d of (docsRes.data ?? []) as Array<{ requirement_item_id: string; evidence_status: string }>) {
      const arr = docByItem.get(d.requirement_item_id) ?? [];
      arr.push(d.evidence_status);
      docByItem.set(d.requirement_item_id, arr);
    }
    for (const sec of (itemsRes.data ?? []) as Array<{ id: string; requirement_items: Array<{ id: string; is_required: boolean }> }>) {
      const items = (sec.requirement_items ?? []).filter((i) => i.is_required);
      const weight = weightMap.get(sec.id) ?? 0;
      if (items.length === 0) continue;
      const accepted = items.filter((item) =>
        (docByItem.get(item.id) ?? []).includes("accepted")
      ).length;
      readinessScore += (accepted / items.length) * weight;
    }
    readinessScore = Math.round(readinessScore);
  }

  const openActions = 0; // gap query above

  // Next steps checklist
  const steps = [
    {
      key: "profile",
      label: "Complete corporate profile",
      href: "/corporate",
      done: corpAccepted > 0 || corpSubmitted > 0,
      urgent: false,
    },
    {
      key: "facility",
      label: "Add at least one facility",
      href: "/facilities",
      done: facilities.length > 0,
      urgent: false,
    },
    {
      key: "product",
      label: "Add at least one product",
      href: "/products",
      done: products.length > 0,
      urgent: false,
    },
    {
      key: "evidence",
      label: "Upload corporate compliance documents",
      href: "/corporate",
      done: corpAccepted >= 3,
      urgent: corpAccepted === 0 && (facilities.length > 0 || products.length > 0),
    },
  ];

  const incomplete = steps.filter((s) => !s.done);

  return (
    <div className="space-y-6">
      {/* Greeting + score */}
      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h1 className="text-xl font-semibold text-ink">
            {companyName ?? displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
          {incomplete.length > 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              <span className="font-semibold">{incomplete.length} step{incomplete.length > 1 ? "s" : ""}</span> remaining before you're ready for importer review.
            </p>
          ) : (
            <p className="mt-2 text-sm text-emerald-700 font-semibold">Setup complete — awaiting importer review.</p>
          )}
        </section>

        <Link href="/corporate" className="group flex flex-col items-center justify-center rounded-lg border border-line bg-white p-5 shadow-soft hover:border-forest transition">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 group-hover:text-forest">Readiness</p>
          <p className={`mt-2 text-4xl font-bold tabular-nums ${scoreColor(readinessScore)}`}>{readinessScore}%</p>
          <StatusBadge tone={scoreTone(readinessScore)} className="mt-2">
            {readinessScore >= 90 ? "Ready" : readinessScore >= 50 ? "In Progress" : "Not Started"}
          </StatusBadge>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Next steps */}
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Setup Checklist</h2>
            <p className="mt-0.5 text-xs text-slate-500">Complete these steps before requesting importer verification.</p>
          </div>
          <div className="divide-y divide-line">
            {steps.map((step) => (
              <Link key={step.key} href={step.href}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition">
                {step.done
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  : step.urgent
                    ? <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    : <Clock className="h-4 w-4 shrink-0 text-slate-300" />
                }
                <span className={`flex-1 text-sm ${step.done ? "text-slate-400 line-through" : "font-medium text-ink"}`}>
                  {step.label}
                </span>
                {!step.done && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
              </Link>
            ))}
          </div>
        </section>

        {/* Quick stats */}
        <div className="space-y-3">
          <Link href="/facilities" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Facilities</p>
            </div>
            <p className="text-2xl font-bold text-ink">{facilities.length}</p>
          </Link>
          <Link href="/products" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Products</p>
            </div>
            <p className="text-2xl font-bold text-ink">{products.length}</p>
          </Link>
          <Link href="/my-suppliers" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Upstream Suppliers</p>
            </div>
            <p className="text-2xl font-bold text-ink">{upstream.length}</p>
          </Link>
          <Link href="/corporate" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Corp. Docs Accepted</p>
            </div>
            <p className="text-2xl font-bold text-ink">{corpAccepted}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
