"use server";

import { redirect } from "next/navigation";
import { CLOSED_MESSAGE, canUseApp } from "@/lib/access";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signUpSchema } from "@/lib/validators/auth";
import { ONBOARDING_URL } from "@/lib/onboarding/paths";
import { LEGAL_VERSION } from "@/lib/legal";

export type AuthActionState =
  | { error: string; unconfirmedEmail?: string }
  | { notice: string }
  | null;

// Where Supabase's confirmation link should land: this deployment's own
// /auth/confirm, which finishes the sign-in (app/auth/confirm/route.ts).
async function confirmUrl() {
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return `${origin}/auth/confirm`;
}

// Supabase's messages are written for developers; say what to do instead.
function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account.";
  if (/rate limit/i.test(message)) return "Too many emails sent just now — wait a few minutes and try again.";
  // The database's signup gate (migration 025) rejected the new user; Auth
  // reports any trigger error as this generic message.
  if (/database error saving new user/i.test(message)) return CLOSED_MESSAGE;
  return message;
}

export async function signUpAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType") || undefined,
    fullName: formData.get("fullName") || undefined,
    acceptTerms: formData.get("acceptTerms"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password, businessName, businessType, fullName } = parsed.data;
  // Pre-launch: no new accounts except the allow-list (lib/access.ts).
  if (!canUseApp(email)) return { error: CLOSED_MESSAGE };
  const supabase = await createClient();

  // The DB trigger `handle_new_user` (012_handle_new_user_trigger.sql) reads
  // this metadata to create the organizations + profiles rows atomically.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // terms_*: a record of what this person agreed to, and when.
      data: {
        business_name: businessName,
        business_type: businessType,
        full_name: fullName,
        terms_version: LEGAL_VERSION,
        terms_accepted_at: new Date().toISOString(),
      },
      emailRedirectTo: await confirmUrl(),
    },
  });

  if (error) {
    return { error: friendly(error.message) };
  }

  // With email confirmation on, Supabase creates the user but no session:
  // sending them to /dashboard would just bounce them back to /login with
  // no explanation. Tell them to confirm instead.
  if (!data.session) {
    redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
  }
  // First stop for a new business: the menu/recipe import (§9.3), shown once.
  redirect(ONBOARDING_URL);
}

export async function logInAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Pre-launch: only the allow-list gets in (lib/access.ts).
  if (!canUseApp(parsed.data.email)) return { error: CLOSED_MESSAGE };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "This account's email address hasn't been confirmed yet. Click the link in the confirmation email, or send a new one.",
        unconfirmedEmail: parsed.data.email,
      };
    }
    return { error: friendly(error.message) };
  }

  redirect("/dashboard");
}

export async function resendConfirmationAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email first." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: await confirmUrl() } });
  if (error) return { error: friendly(error.message) };
  return { notice: `Sent a new confirmation link to ${email}. It can take a minute — check spam too.` };
}

export async function logOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
