// Renders Maple & Rye Bakery's paperwork (scripts/fixtures/maple-rye/data.mjs)
// with headless Edge:
//   *.pdf   real text PDFs, as a vendor would email them (one runs 2 pages)
//   04-…jpg a phone photo of a paper invoice: on a steel counter, rotated,
//           shadowed, warm light — the /invoices/scan case
//   06-…jpg a thermal receipt shot in bad light, blurred past reading
//   ingredients.csv  the owner's own spreadsheet of ingredients + prices
// Run: node scripts/make-business-fixtures.mjs
import fs from "node:fs";
import { chromium } from "playwright-core";
import { BUSINESS, INGREDIENTS, INVOICES, MENU_BOARD, RECIPE_CARD, RECIPE_DOC, money, lineTotal } from "./fixtures/maple-rye/data.mjs";

const DIR = "scripts/fixtures/maple-rye";

function invoiceHtml(inv) {
  const subtotal = inv.lines.reduce((s, l) => s + lineTotal(l), 0);
  const fees = inv.fees.reduce((s, [, n]) => s + n, 0);
  const tax = 0;
  const row = (l) => `<tr><td>${l[0]}</td><td>${l[1]}</td><td class="n">${l[2]}</td><td>${l[3]}</td><td class="n">${money(l[4])}</td><td class="n">${money(lineTotal(l))}</td></tr>`;
  const head = `<tr><th>Item</th><th>Description</th><th class="n">Qty</th><th>Unit</th><th class="n">Unit price</th><th class="n">Amount</th></tr>`;
  const split = inv.pageBreakAfter ?? inv.lines.length;
  const page2 = inv.lines.slice(split);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1c1c1c; font-size: 12px; margin: 0; }
  .top { display: flex; justify-content: space-between; border-bottom: 3px solid ${inv.vendor.color}; padding-bottom: 12px; }
  h1 { color: ${inv.vendor.color}; margin: 0 0 4px; font-size: 22px; }
  .muted { color: #666; }
  .meta td { padding: 2px 0 2px 16px; text-align: right; }
  .addr { display: flex; gap: 64px; margin: 18px 0; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.lines th { background: ${inv.vendor.color}; color: #fff; text-align: left; padding: 7px 6px; font-size: 11px; }
  table.lines td { padding: 7px 6px; border-bottom: 1px solid #ddd; }
  .n { text-align: right; }
  .totals { margin-left: auto; margin-top: 12px; }
  .totals td { padding: 3px 6px; }
  .grand td { font-weight: bold; border-top: 2px solid #1c1c1c; }
  .foot { margin-top: 36px; font-size: 10px; color: #666; }
  .break { page-break-after: always; }
  .cont { font-size: 11px; color: #666; margin-top: 10px; }
</style></head><body>
  <div class="top">
    <div><h1>${inv.vendor.name}</h1>${inv.vendor.lines.map((l) => `<div class="muted">${l}</div>`).join("")}</div>
    <table class="meta">
      <tr><td class="muted">Invoice</td><td><b>${inv.number}</b></td></tr>
      <tr><td class="muted">Invoice date</td><td>${inv.dateText}</td></tr>
      <tr><td class="muted">Terms</td><td>${inv.vendor.terms}</td></tr>
      <tr><td class="muted">Account</td><td>${BUSINESS.account}</td></tr>
    </table>
  </div>
  <div class="addr">
    <div><b>Bill to</b><br>${BUSINESS.name}<br>${BUSINESS.address.join("<br>")}</div>
    <div><b>Ship to</b><br>Same as billing<br>Delivered ${inv.dateText}</div>
  </div>
  <table class="lines">${head}${inv.lines.slice(0, split).map(row).join("")}</table>
  ${page2.length ? `<p class="cont">Continued on page 2 · Page 1 of 2</p><div class="break"></div>
  <div class="top"><div><h1>${inv.vendor.name}</h1><div class="muted">Invoice ${inv.number} · ${inv.dateText} · Page 2 of 2</div></div></div>
  <table class="lines">${head}${page2.map(row).join("")}</table>` : ""}
  <table class="totals">
    <tr><td class="muted">Subtotal</td><td class="n">${money(subtotal)}</td></tr>
    ${inv.fees.map(([k, v]) => `<tr><td class="muted">${k}</td><td class="n">${money(v)}</td></tr>`).join("")}
    <tr><td class="muted">Sales tax (resale exempt)</td><td class="n">${money(tax)}</td></tr>
    <tr class="grand"><td>Total due</td><td class="n">$${money(subtotal + fees + tax)}</td></tr>
  </table>
  <p class="foot">Thank you for your business. Report shortages or damaged goods within 24 hours of delivery. Past-due balances accrue 1.5% per month.</p>
</body></html>`;
}

function receiptHtml(inv) {
  const total = inv.lines.reduce((s, l) => s + lineTotal(l), 0);
  return `<!doctype html><html><body style="margin:0;background:#fbfaf6;font:15px/1.5 'Courier New',monospace;color:#222;width:380px;padding:28px 22px">
  <div style="text-align:center;font-weight:bold;font-size:20px">${inv.vendor.name.toUpperCase()}</div>
  ${inv.vendor.lines.map((l) => `<div style="text-align:center">${l}</div>`).join("")}
  <div style="margin:10px 0;border-top:1px dashed #333"></div>
  <div>${inv.dateText}  TRANS ${inv.number}</div>
  <div style="margin:10px 0;border-top:1px dashed #333"></div>
  ${inv.lines.map((l) => `<div>${l[1]}</div><div style="display:flex;justify-content:space-between"><span>  ${l[2]} @ ${money(l[4])}</span><span>${money(lineTotal(l))}</span></div>`).join("")}
  <div style="margin:10px 0;border-top:1px dashed #333"></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL</span><span>${money(total)}</span></div>
  <div>VISA ****4471  APPROVED</div>
  <div style="text-align:center;margin-top:14px">THANK YOU</div></body></html>`;
}

// A flat scan → a phone photo: paper lying on a counter, rotated a little,
// in perspective, with a soft shadow, warm cast and falloff toward the edges.
function photoHtml(pngB64, { rotate, blur, width, brightness }) {
  return `<!doctype html><html><body style="margin:0;width:900px;height:1200px;overflow:hidden;
    background: radial-gradient(ellipse at 40% 35%, #9a9ea3 0%, #6f7378 55%, #45484c 100%);">
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(95deg,rgba(255,255,255,.035) 0 2px,transparent 2px 7px)"></div>
  <img src="data:image/png;base64,${pngB64}" style="position:absolute;left:50%;top:50%;width:${width}px;
    transform:translate(-50%,-50%) perspective(1400px) rotateX(9deg) rotateZ(${rotate}deg);
    box-shadow: 18px 28px 40px rgba(0,0,0,.45); filter: blur(${blur}px) brightness(${brightness}) sepia(.18) contrast(.94)">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 45% 40%, transparent 45%, rgba(0,0,0,.45) 100%)"></div>
  </body></html>`;
}

function menuHtml(m) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0.7in; }
  body { font-family: Georgia, serif; color: #2b2118; margin: 0; }
  h1 { text-align: center; font-size: 34px; letter-spacing: 2px; margin: 0; }
  .sub { text-align: center; font-style: italic; color: #7a6a58; margin: 4px 0 26px; }
  h2 { font: 600 13px Helvetica, Arial, sans-serif; letter-spacing: 3px; text-transform: uppercase; color: #9a5b1e; border-bottom: 1px solid #d8c9b4; padding-bottom: 4px; margin: 22px 0 8px; }
  .item { display: flex; justify-content: space-between; margin: 10px 0 0; font-size: 18px; }
  .desc { font-size: 13px; color: #7a6a58; font-style: italic; }
  .add { margin-top: 18px; font-size: 13px; color: #7a6a58; text-align: right; }
</style></head><body>
  <h1>${BUSINESS.name.toUpperCase()}</h1><p class="sub">Baked every morning at ${BUSINESS.address[0]}</p>
  ${m.sections.map(([h, items]) => `<h2>${h}</h2>${items.map(([n, p, d]) => `<div class="item"><span>${n}</span><span>${p}</span></div><div class="desc">${d}</div>`).join("")}`).join("")}
  <p class="add">${m.addOn}</p>
  <p class="sub" style="margin-top:30px">Open Tue–Sun, 7am until we sell out</p>
</body></html>`;
}

function cardHtml(r) {
  return `<!doctype html><html><body style="margin:0;padding:34px 38px;width:560px;background:#fffdf5;background-image:repeating-linear-gradient(#fffdf5 0 33px,#bcd3ea 33px 34px);font:21px/34px 'Segoe Print','Bradley Hand','Comic Sans MS',cursive;color:#1f2a44">
  <div style="border-bottom:2px solid #e39b9b;margin-bottom:6px;font-size:26px">${r.title} <span style="float:right;font-size:18px">${r.yieldText}</span></div>
  ${r.lines.map((l) => `<div>• ${l}</div>`).join("")}
  <div style="margin-top:8px;font-size:16px;line-height:26px;color:#40506e">${r.method}</div></body></html>`;
}

function docHtml(r) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0.8in; } body { font: 13px/1.6 Calibri, Arial, sans-serif; color: #222; }
  h1 { font-size: 24px; margin: 0 0 2px; } .y { color: #666; margin: 0 0 16px; } h2 { font-size: 15px; margin: 18px 0 6px; }
</style></head><body>
  <h1>${r.title}</h1><p class="y">${r.yieldText} · from Jordan's recipe binder</p>
  <h2>Ingredients</h2><ul>${r.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
  <h2>Method</h2><ol><li>Brown the butter and let it cool until just warm.</li><li>Whisk with both sugars, then the eggs and vanilla.</li><li>Fold in flour and salt, then the chips. Chill 24 hours.</li><li>Scoop 70 g balls, bake at 180°C for 11–12 minutes, finish with flaky salt.</li></ol>
</body></html>`;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const inv of INVOICES) {
    const out = `${DIR}/${inv.file}`;
    if (inv.kind === "pdf") {
      const page = await browser.newPage();
      await page.setContent(invoiceHtml(inv));
      await page.pdf({ path: out, format: "Letter", printBackground: true });
      await page.close();
    } else {
      const flat = await browser.newPage({ viewport: inv.kind === "blurry" ? { width: 424, height: 560 } : { width: 816, height: 1056 }, deviceScaleFactor: 2 });
      await flat.setContent(inv.kind === "blurry" ? receiptHtml(inv) : invoiceHtml(inv).replace("margin: 0;", "margin: 0; padding: 40px; background: #fff;"));
      const png = (await flat.screenshot({ fullPage: true })).toString("base64");
      await flat.close();
      const photo = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
      await photo.setContent(
        photoHtml(png, inv.kind === "blurry" ? { rotate: 7, blur: 6, width: 440, brightness: 0.62 } : { rotate: -2.2, blur: 0.35, width: 760, brightness: 0.97 }),
      );
      await photo.waitForTimeout(200);
      await photo.screenshot({ path: out, type: "jpeg", quality: 82 });
      await photo.close();
    }
    console.log(`${out}  ${fs.statSync(out).size} bytes`);
  }
  // Onboarding (§9.3): the menu as a PDF, the croissant card as a phone
  // photo, the cookie recipe as a typed PDF.
  const pdf = await browser.newPage();
  await pdf.setContent(menuHtml(MENU_BOARD));
  await pdf.pdf({ path: `${DIR}/${MENU_BOARD.file}`, format: "Letter", printBackground: true });
  await pdf.setContent(docHtml(RECIPE_DOC));
  await pdf.pdf({ path: `${DIR}/${RECIPE_DOC.file}`, format: "Letter", printBackground: true });
  await pdf.close();
  const card = await browser.newPage({ viewport: { width: 636, height: 560 }, deviceScaleFactor: 2 });
  await card.setContent(cardHtml(RECIPE_CARD));
  const cardPng = (await card.screenshot({ fullPage: true })).toString("base64");
  await card.close();
  const cardPhoto = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await cardPhoto.setContent(photoHtml(cardPng, { rotate: 3, blur: 0.3, width: 760, brightness: 0.96 }));
  await cardPhoto.waitForTimeout(200);
  await cardPhoto.screenshot({ path: `${DIR}/${RECIPE_CARD.file}`, type: "jpeg", quality: 82 });
  await cardPhoto.close();
  for (const f of [MENU_BOARD.file, RECIPE_CARD.file, RECIPE_DOC.file]) console.log(`${DIR}/${f}  ${fs.statSync(`${DIR}/${f}`).size} bytes`);

  const csv = ["name,category,base_unit,current_unit_cost", ...INGREDIENTS.map((r) => r.join(","))].join("\n") + "\n";
  fs.writeFileSync(`${DIR}/ingredients.csv`, csv);
  console.log(`${DIR}/ingredients.csv  ${INGREDIENTS.length} rows`);
} finally {
  await browser.close();
}
