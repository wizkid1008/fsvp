export function SectionHeader({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-ink">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action ? (
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]">
          {action}
        </button>
      ) : null}
    </div>
  );
}
