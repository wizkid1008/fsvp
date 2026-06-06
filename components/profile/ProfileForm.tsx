"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Country, Profile } from "@/types/database";
import { CountryCombobox } from "@/components/profile/CountryCombobox";

type CountryOption = Pick<Country, "country_code" | "country_name">;
type ProfileUpdate = Pick<
  Profile,
  "country" | "email" | "full_name" | "importer_type" | "organization_name" | "phone_number" | "position" | "preferred_language" | "supplier_type"
>;
type ProfileInsert = ProfileUpdate & Pick<Profile, "id" | "role" | "user_status">;
type ProfileMutationResult = PromiseLike<{ error: Error | null }>;
type ProfileMutationTable = {
  update(values: ProfileUpdate): {
    eq(column: "id", value: string): {
      select(columns: "id"): {
        single(): ProfileMutationResult;
      };
    };
  };
  insert(values: ProfileInsert): {
    select(columns: "id"): {
      single(): ProfileMutationResult;
    };
  };
};

function cleanFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fieldClassName(readOnly = false) {
  return [
    "mt-2 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-forest",
    readOnly ? "bg-slate-50 text-slate-600" : "bg-white"
  ].join(" ");
}

export function ProfileForm({
  authEmail,
  countries,
  profile,
  userId
}: {
  authEmail: string;
  countries: CountryOption[];
  profile: Profile | null;
  userId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const displayEmail = profile?.email || authEmail;
  const role = profile?.role ?? "supplier";
  const status = profile?.user_status ?? "pending";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    async function save() {
      try {
        const formData = new FormData(event.currentTarget);
        const country = cleanFormValue(formData, "country");
        setSaving(true);

        if (country && !countries.some((option) => option.country_name.toLowerCase() === country.toLowerCase())) {
          setError("Select a country from the dropdown list.");
          return;
        }

        const profileValues: ProfileUpdate = {
          email: authEmail,
          full_name: cleanFormValue(formData, "full_name"),
          organization_name: cleanFormValue(formData, "organization_name"),
          position: cleanFormValue(formData, "position"),
          phone_number: cleanFormValue(formData, "phone_number"),
          country,
          preferred_language: cleanFormValue(formData, "preferred_language") ?? "en",
          supplier_type: cleanFormValue(formData, "supplier_type"),
          importer_type: cleanFormValue(formData, "importer_type")
        };

        const supabase = createBrowserSupabaseClient();
        const profilesTable = supabase.from("profiles") as unknown as ProfileMutationTable;

        if (profile) {
          const { error: updateError } = await profilesTable
            .update(profileValues)
            .eq("id", userId)
            .select("id")
            .single();
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await profilesTable
            .insert({
              id: userId,
              ...profileValues,
              role: "supplier",
              user_status: "pending"
            })
            .select("id")
            .single();
          if (insertError) throw insertError;
        }

        setMessage("Profile saved.");
        router.refresh();
      } catch (saveError) {
        const msg = saveError instanceof Error ? saveError.message : JSON.stringify(saveError);
        setError(`Profile could not be saved: ${msg}`);
      } finally {
        setSaving(false);
      }
    }

    void save();
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
      {message ? <p className="mb-5 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Full Name
          <input name="full_name" defaultValue={profile?.full_name ?? ""} className={fieldClassName()} placeholder="Full name" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Email
          <input value={displayEmail} readOnly className={fieldClassName(true)} />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Organization Name
          <input name="organization_name" defaultValue={profile?.organization_name ?? ""} className={fieldClassName()} placeholder="Organization name" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Position
          <input name="position" defaultValue={profile?.position ?? ""} className={fieldClassName()} placeholder="Position" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Phone Number
          <input name="phone_number" defaultValue={profile?.phone_number ?? ""} className={fieldClassName()} placeholder="Phone number" type="tel" />
        </label>

        <CountryCombobox countries={countries} defaultValue={profile?.country ?? ""} />

        <label className="text-sm font-medium text-slate-700">
          Preferred Language
          <input name="preferred_language" defaultValue={profile?.preferred_language ?? "en"} className={fieldClassName()} placeholder="en" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Supplier Type
          <input name="supplier_type" defaultValue={profile?.supplier_type ?? ""} className={fieldClassName()} placeholder="Supplier type" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Importer Type
          <input name="importer_type" defaultValue={profile?.importer_type ?? ""} className={fieldClassName()} placeholder="Importer type" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Role
          <input value={role} readOnly className={fieldClassName(true)} />
        </label>

        <label className="text-sm font-medium text-slate-700">
          User Status
          <input value={status} readOnly className={fieldClassName(true)} />
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
