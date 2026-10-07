import Link from "next/link";
import { AuthShell } from "@/components/marketing/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { CLOSED_MESSAGE, accessClosed } from "@/lib/access";
import { industryOptions, isIndustryEnabled } from "@/lib/industries/gate";

// ?industry= (from an industry page) preselects the picker when that
// industry is offered.
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  const { industry } = await searchParams;
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
    <AuthShell title="Create your account" subtitle="Set up your business in a couple of minutes — no card needed.">
      <SignUpForm industries={industryOptions()} defaultIndustry={industry && isIndustryEnabled(industry) ? industry : ""} />
    </AuthShell>
  );
}
