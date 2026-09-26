import { createClient } from "@/lib/supabase/server";
import { NewMenuItemForm } from "@/components/menu/NewMenuItemForm";

export default async function MenuPage() {
  const supabase = await createClient();
  const { data: margins } = await supabase.from("menu_item_margins").select("*").order("name");
  const { data: recipes } = await supabase.from("recipes").select("id, name").order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Menu</h1>
      <NewMenuItemForm recipeOptions={recipes ?? []} />
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-2">Name</th>
            <th>Selling price</th>
            <th>Cost/serving</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {(margins ?? []).map((m) => (
            <tr key={m.menu_item_id} className="border-b border-zinc-100">
              <td className="py-2">{m.name}</td>
              <td>${Number(m.selling_price).toFixed(2)}</td>
              <td>{m.cost_per_serving != null ? `$${Number(m.cost_per_serving).toFixed(4)}` : "—"}</td>
              <td>{m.margin_pct != null ? `${m.margin_pct}%` : "—"}</td>
            </tr>
          ))}
          {(margins ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-zinc-400">
                No menu items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
