import { AuthShell } from "@/components/marketing/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account" subtitle="Set up your kitchen in a couple of minutes — no card needed.">
      <SignUpForm />
    </AuthShell>
  );
}
