"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, BookCheck, Archive } from "lucide-react";

export function CloneVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClone() {
    startTransition(async () => {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clone", version_id: versionId }),
      });
      const json = await res.json();
      if (res.ok && json.version_id) {
        router.push(`/admin/rules/${json.version_id}`);
        router.refresh();
      } else {
        alert(json.error ?? "Clone failed");
      }
    });
  }

  return (
    <button onClick={handleClone} disabled={isPending}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
      <Copy className="h-4 w-4" />
      {isPending ? "Cloning…" : "Clone to New Draft"}
    </button>
  );
}

export function PublishVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handlePublish() {
    if (!confirm("Publish this rule version? Once published it cannot be edited — clone it to make changes.")) return;
    startTransition(async () => {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", version_id: versionId }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push("/admin/rules");
        router.refresh();
      } else {
        alert(json.error ?? "Publish failed");
      }
    });
  }

  return (
    <button onClick={handlePublish} disabled={isPending}
      className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#195f4d] disabled:opacity-50">
      <BookCheck className="h-4 w-4" />
      {isPending ? "Publishing…" : "Publish Version"}
    </button>
  );
}

export function ArchiveVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    if (!confirm("Archive this rule version? It will no longer be selectable for new FSVP records.")) return;
    startTransition(async () => {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", version_id: versionId }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push("/admin/rules");
        router.refresh();
      } else {
        alert(json.error ?? "Archive failed");
      }
    });
  }

  return (
    <button onClick={handleArchive} disabled={isPending}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
      <Archive className="h-4 w-4" />
      {isPending ? "Archiving…" : "Archive"}
    </button>
  );
}
