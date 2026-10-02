import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Server-side client: respects RLS, acts as the signed-in user via their
// session cookie. Use this in Server Components, Route Handlers, and Server
// Actions — never the service role key — so the database's RLS policies stay
// the real security boundary.
//
// cache(): one client per request, so the layout, the page and helpers like
// getCurrentOrgId share it (and dedupe their lookups) instead of each making
// their own.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component that can't set cookies (no
            // active response). Safe to ignore as long as proxy.ts refreshes
            // the session on every request.
          }
        },
      },
    },
  );
});
