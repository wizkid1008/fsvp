import type { StatusTone } from "@/types/platform";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface SectionProgress {
  section_key: string;
  section_name: string;
  applies_to: string;
  weight_percent: number;
  required_count: number;
  accepted_count: number;
  submitted_count: number;
  under_review_count: number;
  needs_revision_count: number;
  missing_count: number;
  has_critical_blocker: boolean;
}

function completionPercent(s: SectionProgress): number {
  if (s.required_count === 0) return 0;
  if (s.accepted_count === 0) {
    if (s.submitted_count + s.under_review_count === 0) return 0;
    return 25;
  }
  if (s.accepted_count < s.required_count) return 50;
  if (s.has_critical_blocker) return 75;
  return 100;
}

function completionTone(pct: number): StatusTone {
  if (pct === 100) return "success";
  if (pct >= 50) return "warning";
  if (pct >= 25) return "warning";
  return "danger";
}

function sectionStatusLabel(s: SectionProgress): string {
  const pct = completionPercent(s);
  if (s.required_count === 0) return "Not Started";
  if (pct === 100) return "Complete";
  if (s.needs_revision_count > 0) return "Needs Revision";
  if (s.under_review_count > 0) return "Under Review";
  if (s.submitted_count > 0) return "Submitted";
  if (s.accepted_count > 0) return "In Progress";
  return "Not Started";
}

export function SectionProgressBar({ section }: { section: SectionProgress }) {
  const pct = completionPercent(section);
  const tone = completionTone(pct);

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink truncate">{section.section_name}</p>
            {section.has_critical_blocker && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                Critical blocker
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 capitalize">
            {section.applies_to} · {section.weight_percent}% of score
          </p>
        </div>
        <StatusBadge tone={tone}>{sectionStatusLabel(section)}</StatusBadge>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? "bg-emerald-500" :
            pct >= 50 ? "bg-amber-400" :
            pct >= 25 ? "bg-amber-300" : "bg-red-300"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Counts */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><strong className="text-emerald-600">{section.accepted_count}</strong> accepted</span>
        {section.under_review_count > 0 && (
          <span><strong className="text-sky-600">{section.under_review_count}</strong> under review</span>
        )}
        {section.submitted_count > 0 && (
          <span><strong className="text-amber-600">{section.submitted_count}</strong> submitted</span>
        )}
        {section.needs_revision_count > 0 && (
          <span><strong className="text-red-600">{section.needs_revision_count}</strong> needs revision</span>
        )}
        {section.missing_count > 0 && (
          <span><strong className="text-slate-600">{section.missing_count}</strong> missing</span>
        )}
        <span className="text-slate-400">of {section.required_count} required</span>
      </div>
    </div>
  );
}
