// Every ingredients column except `embedding` (1024 floats — only the
// matching code needs it). Use instead of select("*") for anything that
// reads ingredients for display or returns them from an API.
export const INGREDIENT_COLUMNS =
  "id, org_id, name, category, base_unit, current_unit_cost, current_unit_cost_updated_at, commodity_code, created_at, updated_at";
