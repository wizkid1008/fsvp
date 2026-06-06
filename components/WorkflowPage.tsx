import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import type { AppRole } from "@/types/platform";

type WorkflowCard = {
  title: string;
  description: string;
  items: string[];
};

export async function getCurrentProfileRole(nextPath: string): Promise<AppRole> {
  const { role } = await requireProfileRole(nextPath);
  return role;
}

export function WorkflowPage({
  title,
  description,
  primaryAction,
  cards,
  role = "supplier"
}: {
  title: string;
  description: string;
  primaryAction: string;
  cards: WorkflowCard[];
  role?: AppRole;
}) {
  return (
    <AppShell role={role}>
      <SectionHeader title={title} description={description} action={primaryAction} />
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">{card.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{card.description}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {card.items.map((item) => (
                <div key={item} className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
