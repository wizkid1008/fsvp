import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white border border-line shadow-soft">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
