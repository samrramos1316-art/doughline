"use client";

import { useActionState } from "react";
import { resendConfirmationAction, type AuthActionState } from "@/app/(marketing)/auth-actions";
import { FormMessage } from "@/components/marketing/FormFields";

export function ResendForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(resendConfirmationAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      {state && "notice" in state && <FormMessage kind="notice">{state.notice}</FormMessage>}
      {state && "error" in state && <FormMessage kind="error">{state.error}</FormMessage>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-900 shadow-sm hover:bg-stone-50 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send the email again"}
      </button>
    </form>
  );
}
