"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/(app)/settings/actions";
import type { IndustryOption } from "@/lib/industries/gate";
import { useVocab } from "@/components/app/VocabProvider";
import { lower } from "@/lib/vocab";

type Initial = { name: string; target_margin_pct: number; price_alert_threshold_pct: number; max_unreviewed_line_items: number; default_labor_rate_per_hour: number; business_type: string };

const input = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-amber-200";

function Field({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start sm:gap-4">
      <label htmlFor={id} className="pt-2 text-sm font-medium text-stone-800">{label}</label>
      <div>
        {children}
        <p className="mt-1 text-xs text-stone-500">{hint}</p>
      </div>
    </div>
  );
}

export function SettingsForm({ initial, industries }: { initial: Initial; industries: IndustryOption[] }) {
  const v = useVocab();
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, null);
  return (
    <form action={action} className="space-y-5">
      <Field id="name" label="Business name" hint="Shown in the sidebar.">
        <input id="name" name="name" required defaultValue={initial.name} className={input} />
      </Field>
      <Field id="business_type" label="Industry" hint={`Sets the words the app uses, the unit and category suggestions, and how invoices are read. Your existing ${lower(v.recipes)}, prices and invoices stay exactly as they are.`}>
        <select id="business_type" name="business_type" defaultValue={initial.business_type} className={`${input} max-w-72`}>
          <option value="">Other / prefer not to say</option>
          {industries.map((i) => (
            <option key={i.id} value={i.id}>
              {`${i.name}${i.beta ? " (beta)" : ""}${i.offered ? "" : " (no longer offered)"}`}
            </option>
          ))}
        </select>
      </Field>
      <Field id="target_margin_pct" label="Target margin (%)" hint="Items under this show red; suggestions aim to get you back to it.">
        <input id="target_margin_pct" name="target_margin_pct" type="number" min="1" max="99" step="0.5" required defaultValue={initial.target_margin_pct} className={`${input} max-w-32`} />
      </Field>
      <Field id="price_alert_threshold_pct" label="Price alert when a cost moves by (%)" hint="Smaller moves still update your costs — they just don't raise an alert.">
        <input id="price_alert_threshold_pct" name="price_alert_threshold_pct" type="number" min="0.5" max="100" step="0.5" required defaultValue={initial.price_alert_threshold_pct} className={`${input} max-w-32`} />
      </Field>
      <Field id="max_unreviewed_line_items" label="Pause scanning after (lines to review)" hint="Keeps unchecked matches from piling up and quietly skewing your costs.">
        <input id="max_unreviewed_line_items" name="max_unreviewed_line_items" type="number" min="1" max="500" step="1" required defaultValue={initial.max_unreviewed_line_items} className={`${input} max-w-32`} />
      </Field>
      <Field id="default_labor_rate_per_hour" label="Default labor rate per hour ($)" hint={`Only for ${lower(v.recipes)} where you log labor time. Leave at 0 if you don't cost labor.`}>
        <input id="default_labor_rate_per_hour" name="default_labor_rate_per_hour" type="number" min="0" step="0.01" defaultValue={initial.default_labor_rate_per_hour} className={`${input} max-w-32`} />
      </Field>
      <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
        <button type="submit" disabled={pending} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state && (
          <p role={"error" in state ? "alert" : "status"} className={`text-sm ${"error" in state ? "text-red-600" : "text-emerald-700"}`}>
            {"error" in state ? state.error : "Saved."}
          </p>
        )}
      </div>
    </form>
  );
}
