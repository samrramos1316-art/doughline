// Which industries a business can choose (signup, Settings). Set by
// ENABLED_INDUSTRIES, comma-separated ids; turning an industry on is an env
// change only. "other" is not an industry to enable — it's the "Other /
// prefer not to say" choice, always there. An org already set to an
// industry that's switched off keeps it and keeps working; only the picker
// stops offering it to others.
import { INDUSTRIES, INDUSTRY_IDS, normalizeIndustryId, type IndustryId, type IndustryProfile } from "./index.ts";

export const DEFAULT_ENABLED_INDUSTRIES: IndustryId[] = ["bakery", "food_truck", "caterer"];

export function enabledIndustries(env: string | undefined = process.env.ENABLED_INDUSTRIES): IndustryId[] {
  if (env == null || !env.trim()) return DEFAULT_ENABLED_INDUSTRIES;
  const ids = env
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is IndustryId => (INDUSTRY_IDS as readonly string[]).includes(s) && s !== "other");
  return ids.length ? [...new Set(ids)] : DEFAULT_ENABLED_INDUSTRIES;
}

export function isIndustryEnabled(id: string | null | undefined, env?: string): boolean {
  if (id == null || id === "" || id === "other") return true;
  return enabledIndustries(env).includes(id as IndustryId);
}

export type IndustryOption = { id: IndustryId; name: string; beta: boolean; offered: boolean };

// The picker's choices, in registry order. `current` (the org's own value)
// is always included so Settings never silently changes it, even when that
// industry is no longer offered.
export function industryOptions(current?: string | null, env?: string): IndustryOption[] {
  const enabled = enabledIndustries(env);
  const cur = normalizeIndustryId(current);
  return (Object.values(INDUSTRIES) as IndustryProfile[])
    .filter((p) => p.id !== "other" && (enabled.includes(p.id) || p.id === cur))
    .map((p) => ({ id: p.id, name: p.name, beta: p.status === "beta", offered: enabled.includes(p.id) }));
}
