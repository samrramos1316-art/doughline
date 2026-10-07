import type { Metadata, Viewport } from "next";
import { Landing } from "@/components/landing/Landing";
import { enabledIndustries } from "@/lib/industries/gate";

export const viewport: Viewport = { themeColor: "#0c0b09" };

const description =
  "Snap a photo of a supplier invoice. Your costs and margins update, and you get warned before a price change eats your profit. For bakeries, caterers and other businesses that make what they sell.";

export const metadata: Metadata = {
  title: "DoughTally — know what every product really costs you",
  description,
  openGraph: { title: "Know what every product really costs you", description },
};

// The marketing front page: a client component (its scroll animations need
// the DOM), general-purpose, with food as the first example. The original
// food page lives at /food.
export default function LandingPage() {
  return <Landing variant="general" enabled={enabledIndustries()} />;
}
