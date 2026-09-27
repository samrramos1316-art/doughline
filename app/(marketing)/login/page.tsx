import { AuthShell } from "@/components/marketing/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Log in to see what this week's invoices did to your margins.">
      <LoginForm initialError={error} />
    </AuthShell>
  );
}
