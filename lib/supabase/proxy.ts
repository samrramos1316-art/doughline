import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Session-refresh helper used by the root proxy.ts (Next.js 16 renamed the
// middleware.js convention to proxy.js — see node_modules/next/dist/docs/
// .../file-conventions/proxy.md). Keeps the Supabase auth cookie fresh on
// every request and redirects unauthenticated visitors away from the
// authenticated (app) route group.
export async function updateSession(request: NextRequest) {
  // If a confirmation link's redirect URL isn't on Supabase's allow-list,
  // Supabase falls back to the Site URL (the landing page) with ?code=…;
  // hand it to the route that finishes the sign-in.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const confirm = new URL("/auth/confirm", request.url);
    confirm.search = request.nextUrl.search;
    return NextResponse.redirect(confirm);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAppRoute = request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/invoices") ||
    request.nextUrl.pathname.startsWith("/ingredients") ||
    request.nextUrl.pathname.startsWith("/recipes") ||
    request.nextUrl.pathname.startsWith("/menu") ||
    request.nextUrl.pathname.startsWith("/alerts") ||
    request.nextUrl.pathname.startsWith("/market") ||
    request.nextUrl.pathname.startsWith("/review") ||
    request.nextUrl.pathname.startsWith("/settings");

  if (isAppRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
