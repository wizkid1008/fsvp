import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileCheck2, PackageCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

export type InspectionReadinessItem = {
  key: string;
  label: string;
  detail: string;
  href?: string;
  ready: boolean;
  critical?: boolean;
};

function toneFor(items: InspectionReadinessItem[]): StatusTone {
  if (items.some((item) => !item.ready && item.critical)) return "danger";
  if (items.some((item) => !item.ready)) return "warning";
  return "success";
}

export function InspectionReadinessPanel({
  items,
  recordId,
}: {
  items: InspectionReadinessItem[];
  recordId: string;
}) {
  const complete = items.filter((item) => item.ready).length;
  const tone = toneFor(items);
  const label = tone === "success" ? "Ready" : tone === "danger" ? "Blocked" : "Needs work";

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Inspection readiness
          </p>
          <h2 className="mt-1 text-base font-semibold text-ink">Can this package stand up in review?</h2>
          <p className="mt-1 text-sm text-slate-500">
            {complete} of {items.length} controls are complete for this FSVP record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={tone}>{label}</StatusBadge>
          <Link
            href={`/fsvp-records/${recordId}/print`}
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
          >
            <FileCheck2 className="h-4 w-4" />
            Packet
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.ready ? CheckCircle2 : item.critical ? AlertTriangle : PackageCheck;
          const body = (
            <div className={`rounded-md border px-4 py-3 ${
              item.ready
                ? "border-emerald-200 bg-emerald-50"
                : item.critical
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
            }`}>
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${
                  item.ready ? "text-emerald-600" : item.critical ? "text-red-600" : "text-amber-600"
                }`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                </div>
              </div>
            </div>
          );

          return item.href ? (
            <Link key={item.key} href={item.href} className="block transition hover:opacity-90">
              {body}
            </Link>
          ) : (
            <div key={item.key}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
