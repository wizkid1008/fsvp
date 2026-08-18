"use client";

import { useRouter } from "next/navigation";

type ScopeOption = {
  id: string;
  label: string;
};

export function ScopeSwitcher({
  basePath,
  currentId,
  label,
  options,
  param,
}: {
  basePath: string;
  currentId: string;
  label: string;
  options: ScopeOption[];
  param: string;
}) {
  const router = useRouter();

  if (options.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-soft">
      <label className="text-sm font-semibold text-slate-600" htmlFor={`scope-${param}`}>
        {label}
      </label>
      <select
        id={`scope-${param}`}
        value={currentId}
        onChange={(event) => {
          const nextId = event.target.value;
          router.push(nextId ? `${basePath}?${param}=${encodeURIComponent(nextId)}` : basePath);
        }}
        className="h-10 min-w-64 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-forest"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
