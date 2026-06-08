"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft hover:bg-slate-50 print:hidden"
    >
      <Printer className="h-4 w-4" />
      Export PDF
    </button>
  );
}
