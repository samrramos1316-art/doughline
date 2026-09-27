"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// §6.3: when unreviewed line items across the org exceed the cap, every
// screen except the review queues is covered by this — deliberately not a
// dismissible toast. It goes away only when the backlog is cleared (the
// layout stops rendering it). POST /api/invoices refuses new scans too, so
// this isn't the only thing enforcing the block.
export function ActionRequiredGate({ unresolved, cap }: { unresolved: number; cap: number }) {
  const pathname = usePathname();
  if (pathname === "/review" || /^\/invoices\/[^/]+\/review$/.test(pathname)) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="action-required-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-red-700 px-6"
    >
      <div className="flex max-w-md flex-col items-center gap-5 text-center text-white">
        <p className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-widest uppercase">
          Action required
        </p>
        <h1 id="action-required-title" className="text-3xl font-semibold">
          {unresolved} invoice lines need your review
        </h1>
        <p className="text-base text-red-50">
          Your costs and margins are only as good as these matches. Scanning is paused until you&apos;re back
          to {cap} or fewer unreviewed lines.
        </p>
        <Link
          href="/review"
          className="rounded-full bg-white px-6 py-3 text-base font-semibold text-red-700 shadow-lg"
        >
          Review now
        </Link>
      </div>
    </div>
  );
}
