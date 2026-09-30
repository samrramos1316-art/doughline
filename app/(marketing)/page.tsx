import type { Viewport } from "next";
import { Landing } from "@/components/landing/Landing";

export const viewport: Viewport = { themeColor: "#0c0b09" };

// The marketing front page: a client component (its scroll animations need
// the DOM), the same for everyone.
export default function LandingPage() {
  return <Landing />;
}
