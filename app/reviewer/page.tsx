import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClipboardCheck } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function statusTone(status: string): StatusTone {
  if (status === "approved" || status === "accepted" || status === "complete") return "success";
  if (status === "under_review") return "info";
  if (status === "revision_required" || status === "rejected") return "danger";
  return "neutral";
}

export default async function ReviewerPage() {
  const { role } = await requireProfileRole("/reviewer", ["reviewer", "administrator"]);
  const supabase = createServerSupabaseClient();

  type ReviewRow = { id: string; review_type: string; status: string; notes: string | null; created_at: string; supplier_id: string | null; reviewer_profile_id: string | null; suppliers: { company_name: string } | null; profiles: { full_name: string | null; email: string } | null };

  const { data: rawReviews } = await supabase
    .from("reviews")
    .select("id, review_type, status, notes, created_at, supplier_id, reviewer_profile_id")
    .order("created_at", { ascending: false });

  const reviews = (rawReviews ?? []) as unknown as ReviewRow[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Review Queue"
        description="Review submitted evidence, accept or request revisions, and approve supplier readiness reports."
      />

      {!reviews || reviews.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No reviews in queue"
          description="Evidence submissions and readiness reports submitted for review will appear here. Reviewers can accept, reject, or request revisions."
        />
      ) : (
        <div className="mt-6 space-y-3">
          {reviews.map((review) => {
            const supplier = review.suppliers as { company_name: string } | null;
            const reviewer = review.profiles as { full_name: string | null; email: string } | null;
            return (
              <div key={review.id} className="rounded-lg border border-line bg-white p-5 shadow-soft">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-ink capitalize">{review.review_type.replace(/_/g, " ")} Review</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
                      {supplier && <span>Supplier: <span className="font-medium text-slate-700">{supplier.company_name}</span></span>}
                      {reviewer && <span>Reviewer: <span className="font-medium text-slate-700">{reviewer.full_name || reviewer.email}</span></span>}
                      <span>{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                    {review.notes && <p className="mt-2 text-sm text-slate-600">{review.notes}</p>}
                  </div>
                  <StatusBadge tone={statusTone(review.status)}>
                    {review.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </StatusBadge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
