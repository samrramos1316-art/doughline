import Link from "next/link";
import { AuthShell } from "@/components/marketing/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { CLOSED_MESSAGE, accessClosed } from "@/lib/access";

export default function SignUpPage() {
  // Pre-launch (lib/access.ts): no form to fill in for nothing.
  if (accessClosed()) {
    return (
      <AuthShell title="Not open yet" subtitle="Thanks for your interest in DoughTally.">
        <p role="status" data-testid="closed-notice" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {CLOSED_MESSAGE}
        </p>
        <p className="mt-4 text-center text-sm text-stone-600">
          Already part of the team?{" "}
          <Link href="/login" className="font-medium text-stone-900 underline">
            Log in
          </Link>
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Create your account" subtitle="Start your 14-day free trial — no card needed. Setup takes a couple of minutes.">
      <SignUpForm />
    </AuthShell>
  );
}
