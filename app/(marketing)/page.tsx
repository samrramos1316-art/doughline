import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-32 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">DoughLine</h1>
      <p className="max-w-md text-lg text-zinc-600">
        Protect your margins. Scan an invoice, DoughLine tells you what it does to your menu.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-900"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
