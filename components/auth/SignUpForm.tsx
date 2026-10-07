"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionState } from "@/app/(marketing)/auth-actions";
import { Field, FormMessage, PasswordField, SubmitButton, fieldClass } from "@/components/marketing/FormFields";
import type { IndustryOption } from "@/lib/industries/gate";

// `industries`: what ENABLED_INDUSTRIES offers (lib/industries/gate.ts).
// The industry picker comes first: it sets the words, units and invoice
// reading for the new account (lib/industries).
export function SignUpForm({ industries, defaultIndustry = "" }: { industries: IndustryOption[]; defaultIndustry?: string }) {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(signUpAction, null);

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && <FormMessage kind="error">{state.error}</FormMessage>}
      <div className="space-y-1.5">
        <label htmlFor="businessType" className="text-sm font-medium text-stone-700">
          What kind of business?
        </label>
        <select id="businessType" name="businessType" defaultValue={defaultIndustry} className={fieldClass}>
          <option value="">Other / prefer not to say</option>
          {industries.map((i) => (
            <option key={i.id} value={i.id}>
              {`${i.name}${i.beta ? " (beta)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <Field id="businessName" label="Business name" required autoComplete="organization" placeholder="Sweet Crumb Bakery" />
      <Field id="fullName" label="Your name" autoComplete="name" placeholder="Optional" />
      <Field id="email" label="Email" type="email" required autoComplete="email" placeholder="you@yourbakery.com" />
      <PasswordField autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
      <label htmlFor="acceptTerms" className="flex items-start gap-2.5 text-sm leading-snug text-stone-700">
        <input id="acceptTerms" name="acceptTerms" type="checkbox" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-stone-900 underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-stone-900 underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <SubmitButton pending={pending} pendingText="Creating your account…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-stone-900 underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
