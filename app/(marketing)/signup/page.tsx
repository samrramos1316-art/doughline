"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionState } from "../auth-actions";

export default function SignUpPage() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(
    signUpAction,
    null,
  );

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <form
        action={action}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-zinc-900">Create your account</h1>

        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="businessName" className="text-sm font-medium text-zinc-700">
            Business name
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="businessType" className="text-sm font-medium text-zinc-700">
            Business type
          </label>
          <select
            id="businessType"
            name="businessType"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">Other / prefer not to say</option>
            <option value="bakery">Home bakery</option>
            <option value="food_truck">Food truck</option>
            <option value="caterer">Caterer</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="fullName" className="text-sm font-medium text-zinc-700">
            Your name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

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
            minLength={8}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Sign up"}
        </button>

        <p className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-900 underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
