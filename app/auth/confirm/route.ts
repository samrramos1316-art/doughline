import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Where the signup confirmation email lands. Supabase sends either a PKCE
// `code` (its default link, via /auth/v1/verify) or a `token_hash` + `type`
// (a custom email template); both end with a session cookie and the
// dashboard. Anything else — expired or reused link — goes to /login with
// a readable reason instead of Supabase's developer-facing error text.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let message: string | null = null;
  if (url.searchParams.get("error_description")) {
    // Supabase itself rejected the link (typically expired or already used).
    message = "That confirmation link has expired or was already used. Log in, or send yourself a new one.";
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // A `code` only exists after Supabase has verified the email, so a failed
    // exchange — most often the link opened in a different browser or device
    // than the one that signed up — still means the account is confirmed.
    if (error) message = "Your email address is confirmed. Log in to continue.";
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) message = "That confirmation link has expired or was already used. Log in, or send yourself a new one.";
  } else {
    message = "That confirmation link is incomplete. Log in, or send yourself a new one.";
  }

  if (message) {
    const login = new URL("/login", url);
    login.searchParams.set("error", message);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL("/dashboard", url));
}
