"use client";

import Link from "next/link";

// The bar above a printable sheet: back to where it came from, and Print.
// Not printed itself.
export function SheetBar({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
      <Link href={backHref} className="text-sm font-medium text-stone-600 underline underline-offset-2 hover:text-stone-900">
        ← {backLabel}
      </Link>
      <button type="button" onClick={() => window.print()} className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-800">
        Print or save as PDF
      </button>
    </div>
  );
}
