"use client";

import { useState } from "react";

// Explicit text, placeholder and background colors on every field, so they
// never depend on inherited page colors (see the note in globals.css).
export const fieldClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-amber-200";

export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
      </label>
      <input id={id} name={id} className={fieldClass} {...input} />
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function PasswordField({
  id = "password",
  label = "Password",
  hint,
  ...input
}: { id?: string; label?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
      </label>
      <div className="relative">
        <input id={id} name={id} type={visible ? "text" : "password"} className={`${fieldClass} pr-16`} {...input} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-stone-500 hover:text-stone-900"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ pending, children, pendingText }: { pending: boolean; children: React.ReactNode; pendingText: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-50"
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "notice"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2.5 text-sm ${kind === "error" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"}`}
    >
      {children}
    </p>
  );
}
