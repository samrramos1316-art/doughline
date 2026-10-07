import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { SiteAnalytics } from "@/components/analytics/SiteAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The marketing site's own voice (the app keeps Geist): a condensed,
// characterful grotesque for display, a plain grotesque for reading, and a
// typewriter-ish mono for the ledger/receipt details.
const display = Bricolage_Grotesque({
  variable: "--ff-display",
  subsets: ["latin"],
});

const body = Hanken_Grotesk({
  variable: "--ff-body",
  subsets: ["latin"],
});

const ledger = IBM_Plex_Mono({
  variable: "--ff-ledger",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://doughtally.app"),
  title: "DoughTally",
  description: "Margin tracking for small businesses that buy supplies on invoices and sell what they make: snap an invoice, and costs and margins update.",
  openGraph: {
    siteName: "DoughTally",
    type: "website",
    title: "DoughTally",
    description: "Snap a photo of a supplier invoice. Your costs and margins update, and you get warned before a price change eats your profit.",
  },
  applicationName: "DoughTally",
  // Home-screen behaviour on iOS (the manifest covers everyone else).
  appleWebApp: { capable: true, title: "DoughTally", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${body.variable} ${ledger.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistration />
        <SiteAnalytics />
      </body>
    </html>
  );
}
