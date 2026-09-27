import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getMenuItemMarginHistory } from "@/lib/costing/marginHistory";
import { MenuItemCard } from "@/components/visual/MenuItemCard";
import { getMarketTrends, DEFAULT_WINDOW_DAYS } from "@/lib/market/trends";
import { MarketWatchPanel } from "@/components/market/MarketWatchPanel";

export default async function DashboardPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);

  const { data: org } = await supabase
    .from("organizations")
    .select("target_margin_pct")
    .eq("id", orgId ?? "")
    .maybeSingle();
  const targetPct = Number(org?.target_margin_pct ?? 65);

  const { data: margins } = await supabase.from("menu_item_margins").select("*").order("name");
  const menuItemRows = (margins ?? []).filter(
    (m): m is typeof m & { menu_item_id: string; name: string } => m.menu_item_id != null && m.name != null,
  );

  const trends = await getMarketTrends(supabase, { windowDays: DEFAULT_WINDOW_DAYS });

  const cards = await Promise.all(
    menuItemRows.map(async (m) => {
      const history = await getMenuItemMarginHistory(supabase, m.menu_item_id);
      return {
        menuItemId: m.menu_item_id,
        name: m.name,
        sellingPrice: Number(m.selling_price),
        costPerServing: m.cost_per_serving != null ? Number(m.cost_per_serving) : null,
        marginPct: m.margin_pct != null ? Number(m.margin_pct) : null,
        history: history.map((h) => ({ date: h.date, value: h.marginPct ?? 0 })),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">Target margin: {targetPct}%</p>
      </div>

      {cards.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          No menu items yet — add ingredients, build a recipe, then add a menu item to see
          margins here.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <MenuItemCard
            key={c.menuItemId}
            name={c.name}
            sellingPrice={c.sellingPrice}
            costPerServing={c.costPerServing}
            marginPct={c.marginPct}
            targetPct={targetPct}
            history={c.history}
          />
        ))}
      </div>

      <MarketWatchPanel trends={trends} windowDays={DEFAULT_WINDOW_DAYS} compact />
    </div>
  );
}
