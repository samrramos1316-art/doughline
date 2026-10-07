import type { Metadata, Viewport } from "next";
import { Landing } from "@/components/landing/Landing";

export const viewport: Viewport = { themeColor: "#0c0b09" };

const description =
  "DoughTally reads every delivery slip, keeps what each ingredient really costs, and tells you which menu items just got less profitable, and what to charge instead.";

export const metadata: Metadata = {
  title: "DoughTally for bakeries, food trucks & caterers",
  description,
  openGraph: { title: "DoughTally for bakeries, food trucks & caterers", description },
};

// The food-business page, as the home page was before it went general.
export default function FoodPage() {
  return <Landing variant="food" />;
}
