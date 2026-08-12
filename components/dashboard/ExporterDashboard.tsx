import Link from "next/link";
import { CheckCircle2, AlertCircle, Clock, ArrowRight, Building2, Package, Warehouse, FileText, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionItemsSection } from "./ActionItemsSection";
import { FsvpProcessFlow, type FsvpProcessRecord } from "./FsvpProcessFlow";
import { computeSupplierReadiness, readinessLabel } from "@/lib/readiness/supplier-score";
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
    readiness,
    fsvpRecordsRes,
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
      ? (supabase.from("supplier_relationships") as any)
          .select("id, status, supplier:supplier_id(company_name, supplier_type)")
          .eq("relationship_type", "exporter_supplier")
          .eq("exporter_id", supplierId)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),

    // Shared with /my-readiness — see lib/readiness/supplier-score.ts for why
    // this is no longer computed here.
    computeSupplierReadiness(supabase, supplierId),

    supplierId
      ? (supabase.from("fsvp_records") as any)
          .select("id, status, reassessment_due_at, facilities_verify(facility_name), products_verify(product_name)")
          .eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),
  ]);

  const corpDocs   = (corporateDocsRes.data ?? []) as Array<{ evidence_status: string }>;
  const facilities = (facilitiesRes.data ?? []) as Array<{ id: string; facility_name: string }>;
  const products   = (productsRes.data ?? []) as Array<{ id: string; product_name: string }>;
  const upstream   = (upstreamRes.data ?? []) as Array<{ id: string; supplier: { company_name: string; supplier_type: string } | null }>;
  const fsvpRecords = ((fsvpRecordsRes.data ?? []) as Array<{
    id: string;
    status: FsvpProcessRecord["status"];
    reassessment_due_at: string | null;
    facilities_verify: { facility_name: string } | null;
    products_verify: { product_name: string } | null;
  }>).map((r) => ({
    id: r.id,
    status: r.status,
    reassessment_due_at: r.reassessment_due_at,
    facility_name: r.facilities_verify?.facility_name ?? null,
    product_name: r.products_verify?.product_name ?? null,
  }));

  const corpAccepted  = corpDocs.filter((d) => d.evidence_status === "accepted").length;
  const corpSubmitted = corpDocs.filter((d) => d.evidence_status === "submitted" || d.evidence_status === "under_review").length;

  const readinessScore = readiness.score;

  // Next steps checklist
  const steps = [
    {
      key: "profile",
      label: "Complete company overview",
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
      label: "Upload company overview documents",
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

        {/* Links to /my-readiness, which shows the same number broken down by
            requirement. It used to link to /corporate, which shows neither. */}
        <Link href="/my-readiness" className="group flex flex-col items-center justify-center rounded-lg border border-line bg-white p-5 shadow-soft hover:border-forest transition">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 group-hover:text-forest">Readiness</p>
          <p className={`mt-2 text-4xl font-bold tabular-nums ${scoreColor(readinessScore)}`}>{readinessScore}%</p>
          <StatusBadge tone={scoreTone(readinessScore)} className="mt-2">
            {readinessLabel(readiness)}
          </StatusBadge>
        </Link>
      </div>

      <FsvpProcessFlow records={fsvpRecords} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Next steps */}
        <div className="space-y-4">
        <ActionItemsSection supplierId={supplierId} supabase={supabase} />

        {incomplete.length > 0 ? (
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
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Initial setup complete</span>
            <span className="text-xs text-emerald-600">Company overview, facility, and product added</span>
          </div>
        )}
        </div>

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
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Company Docs Accepted</p>
            </div>
            <p className="text-2xl font-bold text-ink">{corpAccepted}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
