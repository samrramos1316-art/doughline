import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { UNRESOLVED_STATUSES } from "@/lib/matching/review";
import { isoDaysAgo } from "@/lib/dates/localDate";

type Client = SupabaseClient<Database>;
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export type MenuRow = {
  id: string;
  name: string;
  recipeName: string | null;
  price: number;
  costPerServing: number | null;
  marginPct: number | null;
  marginPct30dAgo: number | null;
  history: { date: string; value: number }[];
  isActive: boolean;
  unpriced: string[]; // ingredients with no price yet — margin unknown until they have one
};

export type Mover = { id: string; name: string; unit: string; from: number; to: number; pct: number; menuItems: number };
export type Driver = { name: string; share: number; perRound: number };
export type InboxItem = { kind: "review" | "failed" | "alert" | "stuck"; title: string; detail: string; href: string; tone: "critical" | "warning" | "neutral"; at: string };
export type RecentInvoice = { id: string; date: string | null; vendor: string; number: string | null; lines: number; total: number | null; status: string };

// Every panel on the overview, from one pass over the org's data (RLS keeps
// it to the signed-in business). Margin history is recomputed from price
// history the same way lib/costing/marginHistory.ts does it, but for all
// menu items at once instead of four queries per item.
export async function getOverview(supabase: Client, orgId: string) {
  const since90 = isoDaysAgo(90);
  const since30 = isoDaysAgo(30);

  const [org, menuItems, recipes, recipeIngredients, ingredients, history, alerts, invoices, unresolved] = await Promise.all([
    supabase.from("organizations").select("name, target_margin_pct, max_unreviewed_line_items, price_alert_threshold_pct").eq("id", orgId).single(),
    supabase.from("menu_items").select("id, name, selling_price, recipe_id, servings_per_batch, is_active").order("name"),
    supabase.from("recipes").select("id, name, batch_yield_qty"),
    supabase.from("recipe_ingredients").select("recipe_id, ingredient_id, quantity"),
    supabase.from("ingredients").select("id, name, base_unit, current_unit_cost"),
    supabase.from("ingredient_price_history").select("ingredient_id, unit_cost, effective_date, created_at").order("effective_date").order("created_at"),
    supabase
      .from("price_alerts")
      .select("id, pct_change, previous_unit_cost, new_unit_cost, acknowledged, created_at, ingredients(name, base_unit), menu_item_margin_impacts(id)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoices")
      .select("id, status, invoice_number, invoice_date, total_amount, created_at, vendors(name), invoice_line_items(id, match_status, parsed_line_total)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("invoice_line_items").select("id", { count: "exact", head: true }).in("match_status", [...UNRESOLVED_STATUSES]),
  ]);
  if (org.error || !org.data) throw new Error("loading organization failed: " + (org.error?.message ?? "not found"));

  const target = Number(org.data.target_margin_pct);
  const ing = new Map((ingredients.data ?? []).map((i) => [i.id, i]));
  const recipeById = new Map((recipes.data ?? []).map((r) => [r.id, r]));
  const linesByRecipe = new Map<string, { ingredient_id: string; quantity: number }[]>();
  for (const ri of recipeIngredients.data ?? []) {
    linesByRecipe.set(ri.recipe_id, [...(linesByRecipe.get(ri.recipe_id) ?? []), { ingredient_id: ri.ingredient_id, quantity: Number(ri.quantity) }]);
  }
  const histByIng = new Map<string, { date: string; cost: number }[]>();
  for (const h of history.data ?? []) {
    histByIng.set(h.ingredient_id, [...(histByIng.get(h.ingredient_id) ?? []), { date: h.effective_date, cost: Number(h.unit_cost) }]);
  }
  // An ingredient's cost as of a date: the latest history entry on or
  // before it (entries in effective-date order, ties in the order written).
  const costOn = (ingredientId: string, date: string) => {
    const hs = histByIng.get(ingredientId) ?? [];
    let found: number | null = null;
    for (const h of hs) if (h.date <= date) found = h.cost;
    return found;
  };
  const currentCost = (ingredientId: string) => {
    const c = ing.get(ingredientId)?.current_unit_cost;
    return c == null ? null : Number(c);
  };

  // ---- menu margins + their history -------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const menu: MenuRow[] = (menuItems.data ?? []).map((m) => {
    const recipe = m.recipe_id ? recipeById.get(m.recipe_id) : undefined;
    const lines = (m.recipe_id && linesByRecipe.get(m.recipe_id)) || [];
    const servings = Number(m.servings_per_batch ?? recipe?.batch_yield_qty ?? 0);
    const price = Number(m.selling_price);
    const cps = (costFn: (id: string) => number | null) => {
      if (!lines.length || !servings) return null;
      let total = 0;
      for (const l of lines) {
        const c = costFn(l.ingredient_id);
        if (c == null) return null;
        total += l.quantity * c;
      }
      return total / servings;
    };
    const marginOf = (c: number | null) => (c == null || price <= 0 ? null : round(((price - c) / price) * 100));
    const now = cps(currentCost);
    const ago = cps((id) => costOn(id, since30));
    const ids = lines.map((l) => l.ingredient_id);
    const dates = [...new Set(ids.flatMap((id) => (histByIng.get(id) ?? []).map((h) => h.date)).filter((d) => d >= since90))].sort();
    const points = dates
      .map((d) => ({ date: d, value: marginOf(cps((id) => costOn(id, d))) }))
      .filter((p): p is { date: string; value: number } => p.value != null);
    const nowMargin = marginOf(now);
    if (nowMargin != null && (!points.length || points[points.length - 1].date !== today)) points.push({ date: today, value: nowMargin });
    return {
      id: m.id,
      name: m.name,
      recipeName: recipe?.name ?? null,
      price,
      costPerServing: now,
      marginPct: nowMargin,
      marginPct30dAgo: marginOf(ago),
      history: points,
      isActive: m.is_active,
      unpriced: [...new Set(lines.filter((l) => currentCost(l.ingredient_id) == null).map((l) => ing.get(l.ingredient_id)?.name ?? "?"))],
    };
  });
  const active = menu.filter((m) => m.isActive && m.marginPct != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgMargin = avg(active.map((m) => m.marginPct!));
  const comparable = active.filter((m) => m.marginPct30dAgo != null);
  const avgMargin30dAgo = avg(comparable.map((m) => m.marginPct30dAgo!));
  const avgMarginNowComparable = avg(comparable.map((m) => m.marginPct!));

  // One of every active menu item: what it costs to make now vs 30 days ago.
  const basketNow = active.reduce((s, m) => s + (m.costPerServing ?? 0), 0);
  const basketAgo = comparable.length === active.length && active.length
    ? active.reduce((s, m) => {
        const agoMargin = m.marginPct30dAgo!;
        return s + m.price * (1 - agoMargin / 100);
      }, 0)
    : null;

  // ---- cost movers (90 days) --------------------------------------------
  const usedBy = new Map<string, number>();
  for (const m of menuItems.data ?? []) {
    if (!m.is_active || !m.recipe_id) continue;
    for (const l of linesByRecipe.get(m.recipe_id) ?? []) usedBy.set(l.ingredient_id, (usedBy.get(l.ingredient_id) ?? 0) + 1);
  }
  const movers: Mover[] = [];
  for (const i of ingredients.data ?? []) {
    const to = currentCost(i.id);
    const hs = histByIng.get(i.id) ?? [];
    if (to == null || hs.length < 2) continue;
    const from = costOn(i.id, since90) ?? hs[0].cost;
    if (!from || from === to) continue;
    movers.push({ id: i.id, name: i.name, unit: i.base_unit, from, to, pct: round(((to - from) / from) * 100, 1), menuItems: usedBy.get(i.id) ?? 0 });
  }
  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  // ---- where the cost goes: ingredient share of one of each item -----------
  const perIng = new Map<string, number>();
  for (const m of menuItems.data ?? []) {
    if (!m.is_active || !m.recipe_id) continue;
    const recipe = recipeById.get(m.recipe_id);
    const servings = Number(m.servings_per_batch ?? recipe?.batch_yield_qty ?? 0);
    if (!servings) continue;
    for (const l of linesByRecipe.get(m.recipe_id) ?? []) {
      const c = currentCost(l.ingredient_id);
      if (c != null) perIng.set(l.ingredient_id, (perIng.get(l.ingredient_id) ?? 0) + (l.quantity * c) / servings);
    }
  }
  const driverTotal = [...perIng.values()].reduce((a, b) => a + b, 0);
  const drivers: Driver[] = [...perIng.entries()]
    .map(([id, v]) => ({ name: ing.get(id)?.name ?? "?", perRound: v, share: driverTotal ? v / driverTotal : 0 }))
    .sort((a, b) => b.perRound - a.perRound);

  // ---- invoices, spend, inbox --------------------------------------------
  const invs = invoices.data ?? [];
  const totalOf = (inv: (typeof invs)[number]) =>
    inv.total_amount != null
      ? Number(inv.total_amount)
      : inv.invoice_line_items.some((l) => l.parsed_line_total != null)
        ? inv.invoice_line_items.reduce((s, l) => s + Number(l.parsed_line_total ?? 0), 0)
        : null;
  const recent: RecentInvoice[] = invs.slice(0, 8).map((inv) => ({
    id: inv.id,
    date: inv.invoice_date,
    vendor: inv.vendors?.name ?? "Unknown vendor",
    number: inv.invoice_number,
    lines: inv.invoice_line_items.length,
    total: totalOf(inv),
    status: inv.status,
  }));
  const dated = (inv: (typeof invs)[number]) => inv.invoice_date ?? inv.created_at.slice(0, 10);
  const spend = (since: string) => invs.filter((i) => dated(i) >= since && i.status !== "failed").reduce((s, i) => s + (totalOf(i) ?? 0), 0);
  const byVendor = new Map<string, number>();
  for (const inv of invs.filter((i) => dated(i) >= since90 && i.status !== "failed")) {
    const v = inv.vendors?.name ?? "Unknown vendor";
    byVendor.set(v, (byVendor.get(v) ?? 0) + (totalOf(inv) ?? 0));
  }
  const vendorSpend = [...byVendor.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

  const openAlerts = (alerts.data ?? []).filter((a) => !a.acknowledged && Number(a.pct_change) > 0);
  const inbox: InboxItem[] = [];
  const toReview = unresolved.count ?? 0;
  const cap = org.data.max_unreviewed_line_items;
  if (toReview > 0) {
    inbox.push({
      kind: "review",
      title: `${toReview} invoice line${toReview === 1 ? "" : "s"} to check`,
      detail: toReview > cap ? `Over your limit of ${cap} — scanning is paused until you catch up` : "Confirm matches so prices reach your costs",
      href: "/review",
      tone: toReview > cap ? "critical" : "warning",
      at: new Date().toISOString(),
    });
  }
  for (const inv of invs.filter((i) => i.status === "failed")) {
    inbox.push({
      kind: "failed",
      title: `Couldn't read an invoice${inv.vendors?.name ? ` from ${inv.vendors.name}` : ""}`,
      detail: "Type it in by hand, or delete it if it's the wrong file",
      href: `/invoices/${inv.id}`,
      tone: "warning",
      at: inv.created_at,
    });
  }
  for (const a of openAlerts) {
    const n = a.menu_item_margin_impacts.length;
    inbox.push({
      kind: "alert",
      title: `${a.ingredients?.name ?? "An ingredient"} up ${Number(a.pct_change).toFixed(1)}%`,
      detail: `$${Number(a.previous_unit_cost).toFixed(2)} → $${Number(a.new_unit_cost).toFixed(2)}/${a.ingredients?.base_unit ?? "unit"} · ${n ? `hits ${n} menu item${n === 1 ? "" : "s"}` : "no menu items use it"}`,
      href: `/alerts/${a.id}`,
      tone: Number(a.pct_change) >= 20 ? "critical" : "warning",
      at: a.created_at,
    });
  }
  for (const inv of invs.filter((i) => i.status === "pending" || i.status === "processing")) {
    if (Date.now() - Date.parse(inv.created_at) < 10 * 60_000) continue;
    inbox.push({ kind: "stuck", title: "An upload was never read", detail: "Open Import to read it now", href: "/invoices/import", tone: "neutral", at: inv.created_at });
  }

  return {
    org: { name: org.data.name, target, cap, threshold: Number(org.data.price_alert_threshold_pct) },
    kpis: {
      avgMargin,
      marginChange30d: avgMarginNowComparable != null && avgMargin30dAgo != null ? avgMarginNowComparable - avgMargin30dAgo : null,
      belowTarget: active.filter((m) => m.marginPct! < target).length,
      activeItems: active.length,
      openAlerts: openAlerts.length,
      toReview,
      spend30: spend(since30),
      invoices30: invs.filter((i) => dated(i) >= since30 && i.status !== "failed").length,
      basketNow: active.length ? basketNow : null,
      basketChangePct: basketAgo ? ((basketNow - basketAgo) / basketAgo) * 100 : null,
    },
    menu: [...menu].sort((a, b) => (a.marginPct ?? -1) - (b.marginPct ?? -1)),
    movers,
    drivers,
    recent,
    vendorSpend,
    inbox,
    counts: { ingredients: ingredients.data?.length ?? 0, recipes: recipes.data?.length ?? 0, menuItems: menuItems.data?.length ?? 0, invoices: invs.length },
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
