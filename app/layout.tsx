import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { Analytics } from "@vercel/analytics/next";

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
  title: "DoughTally",
  description: "Protects margins for micro food businesses by automating wholesale invoice processing and real-time cost/margin tracking.",
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
        <Analytics />
      </body>
    </html>
  );
}
