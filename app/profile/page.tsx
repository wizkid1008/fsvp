import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

const fields = [
  "Full Name",
  "Email",
  "Organization Name",
  "Position",
  "Phone Number",
  "Country",
  "Preferred Language",
  "Supplier Type",
  "Importer Type"
];

export default function ProfilePage() {
  return (
    <AppShell>
      <SectionHeader
        title="User Profile"
        description="Maintain identity details linked to Supabase Auth, including role, supplier relationship, status, and login history."
        action="Save profile"
      />
      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field} className="text-sm font-medium text-slate-700">
              {field}
              <input className="mt-2 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-forest" placeholder={field} />
            </label>
          ))}
          <label className="text-sm font-medium text-slate-700">
            Role
            <select className="mt-2 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-forest">
              <option>Supplier</option>
              <option>Reviewer</option>
              <option>Administrator</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            User Status
            <select className="mt-2 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-forest">
              <option>Active</option>
              <option>Pending</option>
              <option>Suspended</option>
            </select>
          </label>
        </div>
      </section>
    </AppShell>
  );
}
