import { redirect } from "next/navigation";
import { AuthShell } from "@/components/marketing/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { createClient } from "@/lib/supabase/server";
import { canUseApp } from "@/lib/access";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // Already signed in (and let in, lib/access.ts): nothing to log in to.
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user && canUseApp(user.email)) redirect("/dashboard");
  return (
    <AuthShell title="Welcome back" subtitle="Log in to see what this week's invoices did to your margins.">
      <LoginForm initialError={error} />
    </AuthShell>
  );
}
