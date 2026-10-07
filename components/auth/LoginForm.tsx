"use client";

import { useActionState } from "react";
import Link from "next/link";
import { logInAction, resendConfirmationAction, type AuthActionState } from "@/app/(marketing)/auth-actions";
import { Field, FormMessage, PasswordField, SubmitButton } from "@/components/marketing/FormFields";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(logInAction, null);
  const [resendState, resend, resending] = useActionState<AuthActionState, FormData>(resendConfirmationAction, null);
  const error = state && "error" in state ? state.error : !state ? initialError : undefined;
  const unconfirmed = state && "error" in state ? state.unconfirmedEmail : undefined;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <Field id="email" label="Email" type="email" autoComplete="email" required placeholder="you@yourbusiness.com" />
        <PasswordField autoComplete="current-password" required />
        <SubmitButton pending={pending} pendingText="Logging in…">
          Log in
        </SubmitButton>
      </form>

      {unconfirmed && (
        <form action={resend} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <input type="hidden" name="email" value={unconfirmed} />
          {resendState && "notice" in resendState && <FormMessage kind="notice">{resendState.notice}</FormMessage>}
          {resendState && "error" in resendState && <FormMessage kind="error">{resendState.error}</FormMessage>}
          <button type="submit" disabled={resending} className="text-sm font-medium text-amber-900 underline disabled:opacity-50">
            {resending ? "Sending…" : `Send a new confirmation email to ${unconfirmed}`}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-stone-600">
        New to DoughTally?{" "}
        <Link href="/signup" className="font-medium text-stone-900 underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
