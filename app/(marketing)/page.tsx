import type { Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/landing/Landing";

export const viewport: Viewport = { themeColor: "#0c0b09" };

// The marketing front page. The page itself is a client component (its
// scroll animations need the DOM); all this does is know who's looking.
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <Landing signedIn={!!user} />;
}
