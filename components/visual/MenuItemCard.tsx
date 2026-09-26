import { MarginHealthBadge } from "./MarginHealthBadge";
import { TrendSparkline, type TrendPoint } from "./TrendSparkline";

export function MenuItemCard({
  name,
  sellingPrice,
  costPerServing,
  marginPct,
  targetPct,
  history,
}: {
  name: string;
  sellingPrice: number;
  costPerServing: number | null;
  marginPct: number | null;
  targetPct: number;
  history: TrendPoint[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-zinc-900">{name}</h3>
        <MarginHealthBadge marginPct={marginPct} targetPct={targetPct} />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-500">Selling price</p>
          <p className="text-lg font-semibold text-zinc-900">${sellingPrice.toFixed(2)}</p>
          {costPerServing != null && (
            <p className="text-xs text-zinc-500">Cost: ${costPerServing.toFixed(2)}/serving</p>
          )}
        </div>
        <TrendSparkline points={history} />
      </div>
    </div>
  );
}
