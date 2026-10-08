"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionState } from "@/app/(marketing)/auth-actions";
import { Field, FormMessage, PasswordField, SubmitButton } from "@/components/marketing/FormFields";
import type { IndustryOption } from "@/lib/industries/gate";

// `industries`: what ENABLED_INDUSTRIES offers (lib/industries/gate.ts).
// The industry picker comes first, as cards: it sets the words, units and
// invoice reading for the new account (lib/industries). A radio group, so
// it posts `businessType` like the dropdown it replaced.
export function SignUpForm({ industries, defaultIndustry = "" }: { industries: IndustryOption[]; defaultIndustry?: string }) {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(signUpAction, null);
  const [picked, setPicked] = useState(defaultIndustry);
  const choices = [...industries.map((i) => ({ id: i.id as string, name: i.name, description: i.description, beta: i.beta })), { id: "", name: "Something else", description: "Any other business. Uses the food wording; change it any time in Settings.", beta: false }];

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && <FormMessage kind="error">{state.error}</FormMessage>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-700">What kind of business?</legend>
        <p className="text-xs text-stone-500">Sets the words, units and invoice reading the app uses. You can change it later in Settings.</p>
        <div className="grid gap-2 sm:grid-cols-2" data-testid="industry-cards">
          {choices.map((c) => (
            <label
              key={c.id || "other"}
              className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-300 ${
                picked === c.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-900 hover:border-stone-500"
              }`}
            >
              <input type="radio" name="businessType" value={c.id} checked={picked === c.id} onChange={() => setPicked(c.id)} className="sr-only" />
              <span className="flex items-center gap-2 text-sm font-semibold">
                {c.name}
                {c.beta && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${picked === c.id ? "bg-white/15 text-amber-200" : "bg-amber-100 text-amber-800"}`}>Beta</span>
                )}
              </span>
              <span className={`mt-0.5 text-xs leading-snug ${picked === c.id ? "text-stone-300" : "text-stone-500"}`}>{c.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="businessName" label="Business name" required autoComplete="organization" placeholder="Maple Street Studio" />
      <Field id="fullName" label="Your name" autoComplete="name" placeholder="Optional" />
      <Field id="email" label="Email" type="email" required autoComplete="email" placeholder="you@yourbusiness.com" />
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
