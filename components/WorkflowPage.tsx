import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import type { AppRole } from "@/types/platform";

type WorkflowCard = {
  title: string;
  description: string;
  items: string[];
};

type ProfileLookup = {
  data: Pick<Profile, "role"> | null;
};

export async function getCurrentProfileRole(): Promise<AppRole> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? ((await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()) as unknown as ProfileLookup)
    : { data: null };

  return profile?.role ?? "supplier";
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
