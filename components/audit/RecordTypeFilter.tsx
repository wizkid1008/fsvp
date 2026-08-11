"use client";

import { useRouter } from "next/navigation";

/**
 * The record-type dropdown on the audit log.
 *
 * Split into a client component because a <select onChange={…}> inside a Server
 * Component throws at render — event handlers cannot cross that boundary — and
 * the whole page died with it. The action filters beside it are plain <a> links,
 * which is why they worked and this did not.
 *
 * The href construction stays on the server and arrives as a function of the
 * chosen value, so this component knows how to navigate without knowing how the
 * page's filters compose.
 */
export function RecordTypeFilter({
  value, options, urlFor,
}: {
  value: string;
  options: string[];
  /** Built server-side so filter composition lives in one place. */
  urlFor: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(urlFor[e.target.value] ?? "/audit-log")}
      className="h-8 rounded-md border border-line bg-white px-2 text-xs text-slate-700 focus:border-forest focus:outline-none"
      aria-label="Filter by record type"
    >
      <option value="">All record types</option>
      {options.map((rt) => (
        <option key={rt} value={rt}>{rt.replace(/_/g, " ")}</option>
      ))}
    </select>
  );
}
