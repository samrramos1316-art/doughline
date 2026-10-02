import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

// Who is signed in, for pages. getClaims() checks the session token's
// signature against the project's public signing key (ES256, fetched once and
// cached), so it costs no trip to Supabase — unlike getUser(), which asks the
// auth server every time. cache() makes the layout and the page share one
// answer per request.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
