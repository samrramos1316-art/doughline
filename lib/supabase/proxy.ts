import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CLOSED_MESSAGE, canUseApp } from "@/lib/access";

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
    request.nextUrl.pathname.startsWith("/onboarding") ||
    request.nextUrl.pathname.startsWith("/settings") ||
    request.nextUrl.pathname.startsWith("/margins") ||
    request.nextUrl.pathname === "/add";

  if (isAppRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Pre-launch (lib/access.ts): someone signed in who isn't on the
  // allow-list (an old test or demo account) is signed out — pages go to
  // /login with the reason, API calls get a 403.
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  if (user && (isAppRoute || isApi) && !canUseApp(user.email)) {
    await supabase.auth.signOut();
    const out = isApi
      ? NextResponse.json({ error: CLOSED_MESSAGE }, { status: 403 })
      : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(CLOSED_MESSAGE)}`, request.url));
    // Carry the cleared session cookies over to the new response.
    for (const c of response.cookies.getAll()) out.cookies.set(c);
    return out;
  }

  return response;
}
