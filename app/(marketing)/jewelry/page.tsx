import type { Metadata, Viewport } from "next";
import { IndustryPage } from "@/components/landing/IndustryPage";
import { INDUSTRIES } from "@/lib/industries";

export const viewport: Viewport = { themeColor: "#0c0b09" };

const description = `DoughTally for jewelers: ${INDUSTRIES.jewelry.description} Snap supplier invoices and see what every price change does to your margins.`;

export const metadata: Metadata = {
  title: "DoughTally for jewelers",
  description,
  openGraph: { title: "DoughTally for jewelers", description },
};

export default function JewelersPage() {
  return <IndustryPage id="jewelry" audience="jewelers" />;
}
