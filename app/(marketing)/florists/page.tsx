import type { Metadata, Viewport } from "next";
import { IndustryPage } from "@/components/landing/IndustryPage";
import { INDUSTRIES } from "@/lib/industries";

export const viewport: Viewport = { themeColor: "#0c0b09" };

const description = `DoughTally for florists: ${INDUSTRIES.florist.description} Snap supplier invoices and see what every price change does to your margins.`;

export const metadata: Metadata = {
  title: "DoughTally for florists",
  description,
  openGraph: { title: "DoughTally for florists", description },
};

export default function FloristsPage() {
  return <IndustryPage id="florist" audience="florists" />;
}
