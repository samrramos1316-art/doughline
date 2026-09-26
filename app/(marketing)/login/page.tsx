"use client";

import { useActionState } from "react";
import Link from "next/link";
import { logInAction, type AuthActionState } from "../auth-actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(
    logInAction,
    null,
  );

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <form
        action={action}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-zinc-900">Log in</h1>

        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-zinc-600">
          No account?{" "}
          <Link href="/signup" className="font-medium text-zinc-900 underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
