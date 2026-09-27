import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest): what the phone uses
// when DoughLine is installed to the home screen. Icons come from
// scripts/make-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "DoughLine",
    short_name: "DoughLine",
    description: "Snap your wholesale invoices and see what every price change does to your menu margins.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Splash screen: the icon's dark stone; status bar: the app's white header.
    background_color: "#1c1917",
    theme_color: "#ffffff",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon for these.
    shortcuts: [
      { name: "Scan an invoice", short_name: "Scan", url: "/invoices/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Review matches", short_name: "Review", url: "/review", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Market Watch", short_name: "Market", url: "/market", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
