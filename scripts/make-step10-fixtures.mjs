// Renders the step 10 test fixtures with headless Edge (playwright-core):
//   scripts/fixtures/invoice-hill-country-dairy.pdf — a real text PDF, the
//     emailed-invoice case bulk import (§9.1) is for.
//   scripts/fixtures/invoice-sysco-bakery-blurry.jpg — the existing Sysco
//     invoice photo, blurred past legibility: the "photo too blurry" case that
//     should land as status 'failed' and route to manual entry (§9.2).
// Run: node scripts/make-step10-fixtures.mjs
import fs from "node:fs";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(fs.readFileSync("scripts/fixtures/invoice-hill-country-dairy.html", "utf8"));
  await page.pdf({ path: "scripts/fixtures/invoice-hill-country-dairy.pdf", format: "Letter", printBackground: true });

  const jpg = fs.readFileSync("scripts/fixtures/invoice-sysco-bakery.jpg").toString("base64");
  const blurPage = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  await blurPage.setContent(
    `<body style="margin:0"><img src="data:image/jpeg;base64,${jpg}" style="width:1100px;height:1400px;filter:blur(11px)"></body>`,
  );
  await blurPage.screenshot({ path: "scripts/fixtures/invoice-sysco-bakery-blurry.jpg", type: "jpeg", quality: 80 });
} finally {
  await browser.close();
}
for (const f of ["invoice-hill-country-dairy.pdf", "invoice-sysco-bakery-blurry.jpg"]) {
  console.log(`scripts/fixtures/${f}: ${fs.statSync(`scripts/fixtures/${f}`).size} bytes`);
}
