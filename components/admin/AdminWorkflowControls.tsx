"use client";

import { useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type WorkflowSetting = {
  setting_key: string;
  label: string;
  detail: string | null;
  boolean_value: boolean | null;
};

export function AdminWorkflowControls({ settings }: { settings: WorkflowSetting[] }) {
  const [items, setItems] = useState(settings);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function updateSetting(settingKey: string, enabled: boolean) {
    const previousItems = items;
    setItems((current) =>
      current.map((item) =>
        item.setting_key === settingKey ? { ...item, boolean_value: enabled } : item
      )
    );
    setPendingKey(settingKey);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      const { error: updateError } = await (supabase.from("app_settings") as any)
        .update({
          boolean_value: enabled,
          updated_by_profile_id: user?.id ?? null
        })
        .eq("setting_key", settingKey);

      if (updateError) {
        setItems(previousItems);
        setError(updateError.message);
      } else {
        setMessage("Workflow setting saved.");
      }

      setPendingKey(null);
    });
  }

  return (
    <div className="space-y-4">
      {items.map((setting) => (
        <label key={setting.setting_key} className="flex items-start justify-between gap-4 border-b border-line pb-4 last:border-0 last:pb-0">
          <span>
            <span className="block text-sm font-semibold text-ink">{setting.label}</span>
            {setting.detail ? <span className="mt-1 block text-sm leading-6 text-slate-500">{setting.detail}</span> : null}
          </span>
          <input
            type="checkbox"
            checked={Boolean(setting.boolean_value)}
            disabled={pendingKey === setting.setting_key}
            onChange={(event) => updateSetting(setting.setting_key, event.target.checked)}
            className="mt-1 h-5 w-5 rounded border-slate-300 text-forest disabled:opacity-60"
          />
        </label>
      ))}

      {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
