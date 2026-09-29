// Does the menu & recipe import make the calls a cook would, and does the
// price cascade then hit the right menu items? End to end, real Claude +
// Voyage, on a deliberately tricky bakery:
//
//   - the price list has look-alikes: bread vs all-purpose flour, unsalted
//     vs salted butter, whole milk vs heavy cream, granulated vs brown sugar
//   - recipes say "flour", "butter", "sugar", "milk" and use cups, sticks,
//     tbsp, eggs; one has water; one needs ingredients not on the list
//   - menu names don't match recipe names ("Almond Croissant" is made from
//     "Laminated Croissant Dough"), one item is a slice of a whole cake, one
//     is the whole cake, two have no recipe at all
//
// Checked: each recipe line → the right ingredient and a sensible amount in
// that ingredient's unit; each menu item → the right recipe and portion;
// saved margins agree with the portion; then invoices move bread flour,
// unsalted butter and salted butter — and each alert lists exactly the menu
// items that really use that ingredient (bread flour → the croissants, not
// the muffin; salted butter → nothing), with suggestions that fix them.
//
// Run: node scripts/test-smart-links-e2e.mjs [--base=https://…] [--keep]
import fs from "node:fs";
import { chromium } from "playwright-core";
import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";

loadEnv();
const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://doughtally.app";
const KEEP = process.argv.includes("--keep");
const OUT = `test-output/smart-links${BASE.includes("localhost") ? "" : "-prod"}`;
const admin = getAdminClient();
const email = `smart-${Date.now()}@example.com`;
const password = "Maple-and-Rye-2026!";
const results = [];
const log = (...a) => console.log(...a);
function check(ok, msg, detail) {
  results.push({ ok: !!ok, msg });
  log(`${ok ? "PASS" : "FAIL"}: ${msg}${!ok && detail ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const near = (a, b, tol) => a != null && Math.abs(Number(a) - b) <= Math.abs(b) * tol;

// [name, base_unit, cost]
const PRICE_LIST = [
  ["Bread Flour", "lb", 0.55],
  ["All-Purpose Flour", "lb", 0.45],
  ["Unsalted Butter", "lb", 4.2],
  ["Salted Butter", "lb", 4.0],
  ["Granulated Sugar", "lb", 0.75],
  ["Light Brown Sugar", "lb", 0.95],
  ["Kosher Salt", "lb", 1.1],
  ["Instant Yeast", "lb", 6.5],
  ["Whole Milk", "gal", 4.5],
  ["Heavy Cream", "qt", 5.0],
  ["Large Eggs", "each", 0.25],
  ["Cream Cheese", "lb", 3.5],
  ["Blueberries", "pt", 3.75],
  ["Lemons", "each", 0.4],
];

// What each line should become: [text on the page, ingredient (or "new"/"free"), expected qty in its unit or null, tolerance]
const RECIPES = [
  {
    file: "laminated-dough.pdf",
    title: "Laminated Croissant Dough",
    yieldText: "Makes 24 croissants",
    lines: [
      ["1 kg flour", "Bread Flour", 2.2046, 0.01],
      ["140 g sugar", "Granulated Sugar", 0.3086, 0.01],
      ["20 g salt", "Kosher Salt", 0.0441, 0.02],
      ["11 g instant yeast", "Instant Yeast", 0.0243, 0.03],
      ["550 ml milk", "Whole Milk", 0.1453, 0.01],
      ["120 ml cold water", "free", null],
      ["570 g cold butter, for lamination", "Unsalted Butter", 1.2566, 0.01],
      ["2 eggs, for egg wash", "Large Eggs", 2, 0.01],
    ],
    method: "Mix, rest overnight, lock in the butter, give three letter folds, shape, proof, egg wash, bake at 400°F.",
  },
  {
    file: "blueberry-muffins.pdf",
    title: "Grandma's Blueberry Muffins",
    yieldText: "Makes 12 muffins",
    lines: [
      ["2 cups flour", "All-Purpose Flour", 0.551, 0.15],
      ["1 cup sugar", "Granulated Sugar", 0.441, 0.15],
      ["1/2 cup butter, melted", "Unsalted Butter", 0.25, 0.15],
      ["2 eggs", "Large Eggs", 2, 0.01],
      ["1 cup milk", "Whole Milk", 0.0625, 0.01],
      ["2 cups fresh blueberries", "Blueberries", 1, 0.01],
      ["2 tsp baking powder", "new", null],
      ["1/2 tsp salt", "Kosher Salt", null],
    ],
    method: "Whisk dry, whisk wet, fold together with the berries, scoop, bake at 375°F for 22 minutes.",
  },
  {
    file: "cheesecake.pdf",
    title: "New York Cheesecake",
    yieldText: "Makes one 9-inch cheesecake",
    lines: [
      ["1 1/2 cups graham cracker crumbs", "new", null],
      ["5 tbsp butter, melted", "Unsalted Butter", 0.1543, 0.15],
      ["32 oz cream cheese, softened", "Cream Cheese", 2, 0.01],
      ["1 cup sugar", "Granulated Sugar", 0.441, 0.15],
      ["4 large eggs", "Large Eggs", 4, 0.01],
      ["1 cup heavy cream", "Heavy Cream", 0.25, 0.01],
    ],
    method: "Press the crust, beat the filling smooth, bake in a water bath at 325°F, cool overnight.",
  },
];

// [menu name, price, recipe title or null, servings per batch (null = the recipe's own yield)]
const MENU = [
  ["Butter Croissant", 4.25, "Laminated Croissant Dough", null],
  ["Almond Croissant", 4.95, "Laminated Croissant Dough", null],
  ["Blueberry Muffin", 3.75, "Grandma's Blueberry Muffins", null],
  ["Cheesecake Slice", 6.5, "New York Cheesecake", 12],
  ["Whole Cheesecake", 48.0, "New York Cheesecake", null],
  ["Drip Coffee", 2.5, null, null],
  ["Lemon Tart", 5.25, null, null],
];

const recipeHtml = (r) => `<html><body style="font-family:Georgia,serif;padding:48px;max-width:640px">
<h1 style="font-size:28px">${r.title}</h1><p><i>${r.yieldText}</i></p>
<h3>Ingredients</h3><ul>${r.lines.map(([t]) => `<li style="margin:4px 0">${t}</li>`).join("")}</ul>
<h3>Method</h3><p>${r.method}</p></body></html>`;
const menuHtml = `<html><body style="font-family:Helvetica,Arial;padding:48px;max-width:560px;background:#fbf7f0">
<h1 style="text-align:center;letter-spacing:3px">CORNER CRUMB BAKERY</h1><p style="text-align:center">Baked every morning</p>
<h2>Pastry</h2>${MENU.slice(0, 5).map(([n, p]) => `<p style="display:flex;justify-content:space-between"><span>${n}</span><span>$${p.toFixed(2)}</span></p>`).join("")}
<h2>Also</h2>${MENU.slice(5).map(([n, p]) => `<p style="display:flex;justify-content:space-between"><span>${n}</span><span>$${p.toFixed(2)}</span></p>`).join("")}
<p style="font-size:12px;color:#777">Add oat milk +0.50</p></body></html>`;

const browser = await chromium.launch({ channel: "msedge", headless: true });
let userId, orgId;
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);
  const render = await browser.newPage();
  for (const [file, html] of [["menu.pdf", menuHtml], ...RECIPES.map((r) => [r.file, recipeHtml(r)])]) {
    await render.setContent(html);
    await render.pdf({ path: `${OUT}/${file}`, format: "Letter" });
  }
  await render.close();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  const api = (method, path, body) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      },
      { method, path, body },
    );

  log("\n=== signup + price list ===");
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Business name").fill("Corner Crumb Bakery");
  await page.getByLabel("What kind of business?").selectOption({ index: 1 });
  await page.getByLabel("Your name").fill("Robin Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign up|create/i }).click();
  await page.waitForURL(/\/onboarding\/import/, { timeout: 60_000 });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = users.users.find((u) => u.email === email).id;
  orgId = (await admin.from("profiles").select("org_id").eq("id", userId).single()).data.org_id;
  const pl = await api("POST", "/api/ingredients/import", { rows: PRICE_LIST.map(([name, base_unit, c], i) => ({ row: i + 1, name, base_unit, current_unit_cost: c })) });
  check(pl.status === 200 && pl.body.inserted === PRICE_LIST.length, `price list: ${PRICE_LIST.length} ingredients with look-alikes`, pl.body);

  log("\n=== read the menu + 3 recipes ===");
  await page.goto(`${BASE}/onboarding/import`);
  await page.getByLabel("Choose menu files").setInputFiles(`${OUT}/menu.pdf`);
  await page.getByLabel("Choose recipe files").setInputFiles(RECIPES.map((r) => `${OUT}/${r.file}`));
  const t0 = Date.now();
  await page.getByRole("button", { name: "Read 4 files" }).click();
  await page.getByRole("region", { name: "Recipes to add" }).waitFor({ timeout: 600_000 });
  await page.getByText("matching to recipes…").waitFor({ state: "detached", timeout: 180_000 });
  log(`  read + reasoned in ${Math.round((Date.now() - t0) / 1000)}s`);
  await page.screenshot({ path: `${OUT}/01-review.png`, fullPage: true });

  const drafts = await page.getByTestId("recipe-draft").evaluateAll((els) =>
    els.map((d) => ({
      name: d.querySelector("input:not([type=checkbox])")?.value,
      lines: [...d.querySelectorAll("[data-testid=recipe-line]")].map((tr) => {
        const sel = tr.querySelector("select");
        return {
          raw: tr.children[1].childNodes[0].textContent.trim(),
          include: tr.querySelector("input[type=checkbox]").checked,
          ingredient: sel?.value === "new" ? "new" : sel?.value ? sel.selectedOptions[0].text.replace(/ \(\d+%\)$/, "") : "",
          qty: tr.querySelector('input[aria-label^="Quantity for"]')?.value ?? "",
          note: tr.querySelector("[data-testid=line-note]")?.textContent ?? "",
        };
      }),
    })),
  );
  fs.writeFileSync(`${OUT}/drafts.json`, JSON.stringify(drafts, null, 2));

  for (const r of RECIPES) {
    const d = drafts.find((x) => x.name?.toLowerCase().includes(r.title.toLowerCase().split(" ").slice(-1)[0].toLowerCase()) || x.name?.toLowerCase() === r.title.toLowerCase());
    check(d, `recipe read: ${r.title} ("${d?.name}")`);
    if (!d) continue;
    log(`  ${r.title}`);
    for (const [text, want, qty, tol] of r.lines) {
      const key = text.replace(/^[\d\s/.,]+(kg|g|ml|cups?|cup|tbsp|tsp|oz|large)?\s*/i, "").split(",")[0].toLowerCase();
      const l = d.lines.find((x) => x.raw.toLowerCase().includes(key));
      if (!l) {
        check(false, `  line "${text}" read`, d.lines.map((x) => x.raw));
        continue;
      }
      if (want === "free") {
        check(!l.include, `  "${text}" → left out, no cost (${l.note})`, l);
      } else if (want === "new") {
        check(l.ingredient === "new", `  "${text}" → new ingredient (not on the price list)`, l);
      } else {
        check(l.ingredient === want, `  "${text}" → ${want} (got ${l.ingredient || "nothing"}; ${l.note})`, l);
        if (qty != null) check(near(l.qty, qty, tol), `    amount ${l.qty} ≈ ${qty} (±${Math.round(tol * 100)}%)`, l);
      }
    }
  }

  const menuRows = await page.getByTestId("menu-draft").evaluateAll((els) =>
    els.map((tr) => {
      const sel = tr.querySelector('select[aria-label^="Recipe for"]');
      return {
        name: tr.querySelector('input[aria-label="Menu item name"]').value,
        recipe: sel.value ? sel.selectedOptions[0].text.replace(/ \(new\)$/, "") : null,
        servings: tr.querySelector('input[aria-label^="Servings per batch"]').value,
        note: tr.querySelector("[data-testid=menu-note]")?.textContent ?? "",
      };
    }),
  );
  fs.writeFileSync(`${OUT}/menu.json`, JSON.stringify(menuRows, null, 2));
  const recipeNameFor = (title) => drafts.find((x) => x.name?.toLowerCase().includes(title.toLowerCase().split(" ").slice(-1)[0].toLowerCase()))?.name;
  log("  menu");
  for (const [name, , recipe, servings] of MENU) {
    const m = menuRows.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!m) {
      check(false, `menu item read: ${name}`, menuRows.map((x) => x.name));
      continue;
    }
    const want = recipe ? recipeNameFor(recipe) : null;
    check(m.recipe === want, `  ${name} → ${want ?? "no recipe"} (got ${m.recipe ?? "none"}; ${m.note})`, m);
    if (recipe) {
      const got = m.servings === "" ? null : Number(m.servings);
      const ok = servings == null ? got == null || (name === "Whole Cheesecake" && got === 1) || [24, 12].includes(got) : got === servings;
      check(ok, `    per batch: ${servings ?? "the recipe's yield"} (got ${m.servings || "blank"})`, m);
    }
  }
  check(!menuRows.some((m) => /oat milk/i.test(m.name)), "the oat-milk add-on isn't a menu item");

  log("\n=== save, then price the new ingredients ===");
  // Anything the import couldn't size gets a small amount so the save can go through; counted as a failure above if it mattered.
  const blanks = page.locator('[data-testid=recipe-line]:has(input[type=checkbox]:checked) input[aria-label^="Quantity for"]');
  for (let i = 0; i < (await blanks.count()); i++) if ((await blanks.nth(i).inputValue()) === "") await blanks.nth(i).fill("0.01");
  await page.getByRole("button", { name: /^Save \d+ recipes? and \d+ menu items?$/ }).click();
  await page.getByText("You're set up.").waitFor({ timeout: 180_000 });
  const { data: ings } = await admin.from("ingredients").select("id, name, base_unit, current_unit_cost").eq("org_id", orgId);
  const added = ings.filter((i) => !PRICE_LIST.some(([n]) => n === i.name));
  check(added.length === 2 && added.some((i) => /graham/i.test(i.name)) && added.some((i) => /baking powder/i.test(i.name)), `new ingredients: ${added.map((i) => `${i.name} (${i.base_unit})`).join(", ")}`);
  for (const i of added) await api("PATCH", `/api/ingredients/${i.id}`, { current_unit_cost: 3 });

  const { data: margins } = await admin.from("menu_item_margins").select("name, selling_price, cost_per_serving, margin_pct").eq("org_id", orgId);
  const mg = (n) => margins.find((m) => m.name.toLowerCase() === n.toLowerCase());
  log(`  margins: ${margins.map((m) => `${m.name} ${m.margin_pct ?? "—"}%`).join(" · ")}`);
  // Hand cost of a croissant from the price list: flour 2.2046×.55 + sugar .3086×.75 + salt .0441×1.1 + yeast .0243×6.5 + milk .1453×4.5 + butter 1.2566×4.2 + 2 eggs×.25, over 24.
  const croissantCost = (2.2046 * 0.55 + 0.3086 * 0.75 + 0.0441 * 1.1 + 0.0243 * 6.5 + 0.1453 * 4.5 + 1.2566 * 4.2 + 2 * 0.25) / 24;
  check(near(mg("Butter Croissant")?.cost_per_serving, croissantCost, 0.03), `croissant costs $${Number(mg("Butter Croissant")?.cost_per_serving).toFixed(3)} (hand: $${croissantCost.toFixed(3)})`);
  const slice = Number(mg("Cheesecake Slice")?.cost_per_serving);
  const whole = Number(mg("Whole Cheesecake")?.cost_per_serving);
  check(slice > 0 && near(slice * 12, whole, 0.001), `a slice costs 1/12 of the whole cheesecake ($${slice.toFixed(2)} × 12 = $${whole.toFixed(2)})`);
  check(mg("Drip Coffee") && mg("Drip Coffee").cost_per_serving == null, "coffee has no recipe, so no cost is invented");
  await page.goto(`${BASE}/menu`);
  await page.screenshot({ path: `${OUT}/02-menu.png`, fullPage: true });

  log("\n=== the cascade: which menu items does each price move hit? ===");
  const invoiceId = crypto.randomUUID();
  await api("POST", "/api/invoices", { id: invoiceId, file_storage_path: `${orgId}/${invoiceId}.jpg`, file_type: "image" });
  const ingId = (n) => ings.find((i) => i.name === n).id;
  const moves = [
    // [line, ingredient, new cost per base unit, menu items that must be hit]
    [{ raw_text: "KA SIR GALAHAD BREAD FLR 50#", quantity: 2, unit: "bag", unit_cost: 35, pack_quantity: 50, pack_unit: "lb" }, "Bread Flour", 0.7, ["Almond Croissant", "Butter Croissant"]],
    [{ raw_text: "BUTTER SALTED 36/1#", quantity: 1, unit: "case", unit_cost: 172.8, pack_quantity: 36, pack_unit: "lb" }, "Salted Butter", 4.8, []],
    [{ raw_text: "BUTTER UNSALTED AA 36/1#", quantity: 1, unit: "case", unit_cost: 181.44, pack_quantity: 36, pack_unit: "lb" }, "Unsalted Butter", 5.04, ["Almond Croissant", "Blueberry Muffin", "Butter Croissant", "Cheesecake Slice", "Whole Cheesecake"]],
  ];
  const added2 = await api("POST", `/api/invoices/${invoiceId}/line-items`, { lines: moves.map(([l]) => l) });
  check(added2.status === 201, `invoice with 3 price moves entered (HTTP ${added2.status})`, added2.body);
  for (const [i, [line, ing, cost, hit]] of moves.entries()) {
    const li = added2.body.line_items[i];
    const conf = await api("POST", `/api/line-items/${li.id}/confirm`, { ingredient_id: ingId(ing) });
    const price = conf.body.price;
    check(price?.applied && near(price.new_unit_cost, cost, 0.001), `${line.raw_text} → ${ing} $${price?.new_unit_cost}/lb`, conf.body);
    if (!price?.price_alert_id) {
      check(hit.length === 0, `  ${ing}: no alert${hit.length ? " (expected one)" : ""}`);
      continue;
    }
    const { data: impacts } = await admin.from("menu_item_margin_impacts").select("previous_margin_pct, new_margin_pct, menu_items(name)").eq("price_alert_id", price.price_alert_id);
    const got = impacts.map((x) => x.menu_items.name).sort();
    check(JSON.stringify(got) === JSON.stringify([...hit].sort()), `  ${ing} alert hits exactly: ${hit.join(", ") || "nothing"} (got ${got.join(", ") || "nothing"})`);
    check(impacts.every((x) => Number(x.new_margin_pct) < Number(x.previous_margin_pct)), "  every hit item's margin went down");
    if (hit.length) {
      const sug = await api("GET", `/api/alerts/${price.price_alert_id}/suggestions`);
      const items = sug.body.items ?? [];
      check(items.length === hit.length && items.every((s) => s.raise_price || s.reduce_portion || s.goal === null), `  suggestions for all ${hit.length}: ${items.map((s) => `${s.menu_item_name}${s.raise_price ? ` → $${s.raise_price.new_price}` : ""}${s.reduce_portion?.feasible ? ` or −${s.reduce_portion.reduce_by_display}` : ""}`).join("; ")}`, sug.body);
      const croissant = items.find((s) => s.menu_item_name === "Butter Croissant");
      if (ing === "Bread Flour" && croissant) check(near(croissant.ingredient_qty_per_batch, 2.2046, 0.01), `  portion math uses the dough's 2.2 lb of bread flour (${croissant.ingredient_qty_per_batch})`);
    }
  }
  await page.goto(`${BASE}/alerts`);
  await page.screenshot({ path: `${OUT}/03-alerts.png`, fullPage: true });
} catch (err) {
  check(false, "run stopped early", err.stack?.split("\n").slice(0, 4).join(" | "));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  for (const f of failed) log(`  FAIL: ${f.msg}`);
  if (KEEP) log(`Kept: ${email} / ${password}`);
  else if (userId) {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(userId);
    log("test business deleted");
  }
  process.exit(failed.length ? 1 : 0);
}
