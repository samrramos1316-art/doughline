import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Client-side client for use in Client Components. Still RLS-scoped — the
// publishable key has no elevated privileges, it just gets a browser-managed
// session instead of a server-read cookie jar.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
