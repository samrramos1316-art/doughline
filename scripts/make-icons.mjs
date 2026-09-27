// Draws DoughLine's app icons and renders them to PNG/ICO in headless Edge.
// The mark is the logo's loaf: an amber dome whose score line doubles as a
// rising price line, on the site's dark stone background.
//
// Writes:
//   public/icons/icon-192.png, icon-512.png   manifest "any" icons (rounded corners baked in)
//   public/icons/maskable-512.png             manifest "maskable" (full bleed; the OS crops it)
//   app/apple-icon.png                        180px home-screen icon for iOS (iOS rounds it)
//   app/icon.svg                              browser-tab icon
//   app/favicon.ico                           16/32/48px fallback for older browsers
//
// Run: node scripts/make-icons.mjs   (re-run after changing the drawing)
import fs from "node:fs";
import { chromium } from "playwright-core";

const STONE = "#1c1917";

// Large-size icon on a 512 grid. `rounded` bakes in corners for the "any"
// icons; `scale` shrinks the loaf about the centre (maskable icons must keep
// everything inside the central 80% circle).
function bigIcon({ rounded, scale = 1 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="glow" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#44403c"/>
      <stop offset="100%" stop-color="${STONE}"/>
    </radialGradient>
    <linearGradient id="crust" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="55%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <clipPath id="loaf"><path d="${LOAF}"/></clipPath>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#glow)"/>
  <g transform="translate(256 262) scale(${scale}) translate(-256 -262)">
    <ellipse cx="256" cy="366" rx="170" ry="14" fill="#000" opacity="0.35"/>
    <path d="${LOAF}" fill="url(#crust)"/>
    <path d="M136 250 C160 196 204 170 256 168" fill="none" stroke="#fef3c7" stroke-width="10" stroke-linecap="round" opacity="0.55" clip-path="url(#loaf)"/>
    <path d="${SCORE}" fill="none" stroke="#fde68a" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" clip-path="url(#loaf)"/>
    <path d="${SCORE}" fill="none" stroke="${STONE}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}
// The score line: a rising price line cut into the crust (pale dough shows either side).
const SCORE = "M162 302 L216 258 L262 288 L334 220";
const LOAF = "M100 330 C100 226 170 156 256 156 C342 156 412 226 412 330 Q412 356 386 356 H126 Q100 356 100 330 Z";

// Small-size mark (the logo's 32px drawing) for tabs and the favicon: fewer,
// thicker strokes so it still reads at 16px.
const SMALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="${STONE}"/>
  <path d="M5.5 21c0-6.3 4.7-10.8 10.5-10.8S26.5 14.7 26.5 21c0 1.1-.9 2-2 2h-17c-1.1 0-2-.9-2-2Z" fill="#f59e0b"/>
  <path d="M9.8 19l3.8-3.3 3.1 2.1 5-5" fill="none" stroke="${STONE}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function render(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// ICO container holding PNG images (supported by every browser that reads .ico).
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  fs.mkdirSync("public/icons", { recursive: true });
  const out = {
    "public/icons/icon-192.png": await render(page, bigIcon({ rounded: true }), 192),
    "public/icons/icon-512.png": await render(page, bigIcon({ rounded: true }), 512),
    "public/icons/maskable-512.png": await render(page, bigIcon({ rounded: false, scale: 0.86 }), 512),
    "app/apple-icon.png": await render(page, bigIcon({ rounded: false, scale: 1.08 }), 180),
    "app/favicon.ico": ico([
      { size: 16, data: await render(page, SMALL, 16) },
      { size: 32, data: await render(page, SMALL, 32) },
      { size: 48, data: await render(page, bigIcon({ rounded: true }), 48) },
    ]),
  };
  for (const [file, data] of Object.entries(out)) fs.writeFileSync(file, data);
  fs.writeFileSync("app/icon.svg", SMALL + "\n");
  fs.writeFileSync("public/icons/source-512.svg", bigIcon({ rounded: true }) + "\n");
  for (const f of [...Object.keys(out), "app/icon.svg"]) console.log(`${f}  ${fs.statSync(f).size} bytes`);
} finally {
  await browser.close();
}
