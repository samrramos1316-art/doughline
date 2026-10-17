import type { Metadata, Viewport } from "next";
import { IndustryPage } from "@/components/landing/IndustryPage";
import { INDUSTRIES } from "@/lib/industries";

export const viewport: Viewport = { themeColor: "#0c0b09" };

const description = `DoughTally for metal fabricators: ${INDUSTRIES.metalworking.description} Snap supplier invoices and see what every price change does to your margins.`;

export const metadata: Metadata = {
  title: "DoughTally for metal fabricators",
  description,
  openGraph: { title: "DoughTally for metal fabricators", description },
};

export default function FabricationPage() {
  return <IndustryPage id="metalworking" audience="fabricators" />;
}
