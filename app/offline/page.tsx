import type { Metadata } from "next";
import { LogoMark } from "@/components/marketing/Logo";
import { RetryWhenOnline } from "@/components/pwa/RetryWhenOnline";

// Shown by the service worker (public/sw.js) in place of the browser's own
// error page when a page can't load without a connection. It must render
// from the cache alone, so it's static and reads no data.
export const metadata: Metadata = { title: "You're offline · DoughLine" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[#faf8f5] px-6 py-16 text-center">
      <LogoMark className="h-14 w-14" />
      <h1 className="mt-6 font-serif text-4xl text-stone-900">You&apos;re offline</h1>
      <p className="mt-3 max-w-sm text-stone-600">
        DoughLine needs a connection to show your prices and margins, so it never shows you out-of-date numbers.
      </p>
      <p className="mt-1 max-w-sm text-stone-600">This page will reload as soon as you&apos;re back online.</p>
      <RetryWhenOnline />
    </main>
  );
}
