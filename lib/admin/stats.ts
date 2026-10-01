import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The owner's console (/admin): how many businesses signed up and how much
// they use DoughTally. Counts and dates only — never what's inside an
// invoice, recipe or menu. Reads with the service role (every org at once),
// so the page must check isAdmin() before calling this.

// What one invoice read by the AI costs, roughly (Opus 5.5, ~4k tokens in,
// ~5k out with thinking). An estimate for the spend tile, not a bill.
export const EST_COST_PER_READ = 0.11;
const READ_STATUSES = new Set(["needs_review", "completed", "failed"]);
const DAY = 86_400_000;

type Admin = ReturnType<typeof createAdminClient>;

// PostgREST returns at most 1000 rows a request; page through the rest.
async function fetchAll<T>(admin: Admin, table: "invoices" | "recipes" | "menu_items" | "ingredients" | "organizations" | "profiles", columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

// Throwaway accounts from the test suites and the demo login.
export const isTestEmail = (email: string | undefined) => !email || /@example\.com$|\.test$/i.test(email);

export type AccountRow = {
  orgId: string | null;
  business: string;
  businessType: string | null;
  email: string;
  signedUp: string;
  lastSignIn: string | null;
  lastActive: string | null; // latest of sign-in and anything they added
  invoices: number;
  failed: number;
  recipes: number;
  menuItems: number;
  ingredients: number;
  test: boolean;
};

export async function getAdminStats({ includeTest }: { includeTest: boolean }) {
  const admin = createAdminClient();
  const users: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const [orgs, profiles, invoices, recipes, menuItems, ingredients] = await Promise.all([
    fetchAll<{ id: string; name: string; business_type: string | null }>(admin, "organizations", "id, name, business_type"),
    fetchAll<{ id: string; org_id: string | null }>(admin, "profiles", "id, org_id"),
    fetchAll<{ org_id: string; status: string; created_at: string }>(admin, "invoices", "org_id, status, created_at"),
    fetchAll<{ org_id: string; created_at: string }>(admin, "recipes", "org_id, created_at"),
    fetchAll<{ org_id: string; created_at: string }>(admin, "menu_items", "org_id, created_at"),
    fetchAll<{ org_id: string; created_at: string }>(admin, "ingredients", "org_id, created_at"),
  ]);

  const orgOf = new Map(profiles.map((p) => [p.id, p.org_id]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const per = new Map<string, { invoices: number; failed: number; recipes: number; menuItems: number; ingredients: number; last: string | null }>();
  const bump = (orgId: string, key: "invoices" | "recipes" | "menuItems" | "ingredients", at: string, failed = false) => {
    const c = per.get(orgId) ?? { invoices: 0, failed: 0, recipes: 0, menuItems: 0, ingredients: 0, last: null };
    c[key]++;
    if (failed) c.failed++;
    if (!c.last || at > c.last) c.last = at;
    per.set(orgId, c);
  };
  for (const i of invoices) bump(i.org_id, "invoices", i.created_at, i.status === "failed");
  for (const r of recipes) bump(r.org_id, "recipes", r.created_at);
  for (const m of menuItems) bump(m.org_id, "menuItems", m.created_at);
  for (const g of ingredients) bump(g.org_id, "ingredients", g.created_at);

  const all: AccountRow[] = users.map((u) => {
    const orgId = orgOf.get(u.id) ?? null;
    const org = orgId ? orgById.get(orgId) : undefined;
    const c = (orgId && per.get(orgId)) || { invoices: 0, failed: 0, recipes: 0, menuItems: 0, ingredients: 0, last: null };
    const lastSignIn = u.last_sign_in_at ?? null;
    const lastActive = [lastSignIn, c.last].filter((d): d is string => !!d).sort().pop() ?? null;
    return {
      orgId,
      business: org?.name ?? "(no business)",
      businessType: org?.business_type ?? null,
      email: u.email ?? "",
      signedUp: u.created_at,
      lastSignIn,
      lastActive,
      invoices: c.invoices,
      failed: c.failed,
      recipes: c.recipes,
      menuItems: c.menuItems,
      ingredients: c.ingredients,
      test: isTestEmail(u.email),
    };
  });
  const accounts = all.filter((a) => includeTest || !a.test).sort((a, b) => b.signedUp.localeCompare(a.signedUp));
  const shownOrgs = new Set(accounts.map((a) => a.orgId).filter(Boolean));
  const shownInvoices = invoices.filter((i) => shownOrgs.has(i.org_id));

  const now = Date.now();
  const within = (iso: string | null, days: number) => !!iso && now - Date.parse(iso) <= days * DAY;
  // Last 30 days, oldest first, by UTC date.
  const days = Array.from({ length: 30 }, (_, k) => new Date(now - (29 - k) * DAY).toISOString().slice(0, 10));
  const perDay = (dates: string[]) => {
    const counts = new Map<string, number>();
    for (const d of dates) counts.set(d.slice(0, 10), (counts.get(d.slice(0, 10)) ?? 0) + 1);
    return days.map((d) => ({ date: d, count: counts.get(d) ?? 0 }));
  };
  const reads = shownInvoices.filter((i) => READ_STATUSES.has(i.status));

  return {
    accounts,
    hiddenTest: all.filter((a) => a.test).length,
    totals: {
      accounts: accounts.length,
      new1: accounts.filter((a) => within(a.signedUp, 1)).length,
      new7: accounts.filter((a) => within(a.signedUp, 7)).length,
      new30: accounts.filter((a) => within(a.signedUp, 30)).length,
      active7: accounts.filter((a) => within(a.lastActive, 7)).length,
      active30: accounts.filter((a) => within(a.lastActive, 30)).length,
      usedIt: accounts.filter((a) => a.invoices + a.recipes + a.menuItems + a.ingredients > 0).length,
      invoices: shownInvoices.length,
      invoices30: shownInvoices.filter((i) => within(i.created_at, 30)).length,
      failed: shownInvoices.filter((i) => i.status === "failed").length,
      reads: reads.length,
      reads30: reads.filter((i) => within(i.created_at, 30)).length,
      recipes: accounts.reduce((s, a) => s + a.recipes, 0),
      menuItems: accounts.reduce((s, a) => s + a.menuItems, 0),
      ingredients: accounts.reduce((s, a) => s + a.ingredients, 0),
    },
    signupsPerDay: perDay(accounts.map((a) => a.signedUp)),
    invoicesPerDay: perDay(shownInvoices.map((i) => i.created_at)),
  };
}

export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;
