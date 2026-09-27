"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionState } from "@/app/(marketing)/auth-actions";
import { Field, FormMessage, PasswordField, SubmitButton, fieldClass } from "@/components/marketing/FormFields";

export function SignUpForm() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(signUpAction, null);

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && <FormMessage kind="error">{state.error}</FormMessage>}
      <Field id="businessName" label="Business name" required autoComplete="organization" placeholder="Sweet Crumb Bakery" />
      <div className="space-y-1.5">
        <label htmlFor="businessType" className="text-sm font-medium text-stone-700">
          What kind of business?
        </label>
        <select id="businessType" name="businessType" defaultValue="" className={fieldClass}>
          <option value="">Other / prefer not to say</option>
          <option value="bakery">Home bakery</option>
          <option value="food_truck">Food truck</option>
          <option value="caterer">Caterer</option>
        </select>
      </div>
      <Field id="fullName" label="Your name" autoComplete="name" placeholder="Optional" />
      <Field id="email" label="Email" type="email" required autoComplete="email" placeholder="you@yourbakery.com" />
      <PasswordField autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
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
