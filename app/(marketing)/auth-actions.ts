"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signUpSchema } from "@/lib/validators/auth";

export type AuthActionState = { error: string } | null;

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType") || undefined,
    fullName: formData.get("fullName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password, businessName, businessType, fullName } = parsed.data;
  const supabase = await createClient();

  // The DB trigger `handle_new_user` (012_handle_new_user_trigger.sql) reads
  // this metadata to create the organizations + profiles rows atomically.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { business_name: businessName, business_type: businessType, full_name: fullName },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function logInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function logOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
