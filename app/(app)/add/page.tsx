import Link from "next/link";
import { PageHeader } from "@/components/ui/dash";

// One place to start any photo import, linked from the sidebar and the phone
// top bar. Each kind has its own reader: an invoice goes to the invoice
// scanner (it turns menus and recipes away), menus and recipes to their own
// import screens.
const KINDS = [
  {
    href: "/invoices/scan",
    title: "A supplier invoice or receipt",
    body: "What you paid. Prices go into your ingredient costs and your margins move with them.",
    cta: "Scan an invoice",
    alt: { href: "/invoices/import", label: "Upload several PDFs" },
    icon: "M6 2h9l4 4v16H6zM15 2v4h4M9 11h7M9 15h7M9 19h4",
  },
  {
    href: "/onboarding/import?kind=menu",
    title: "Your menu",
    body: "What you sell and for how much. Each item is linked to the recipe it's made from.",
    cta: "Import your menu",
    icon: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  },
  {
    href: "/onboarding/import?kind=recipe",
    title: "A recipe",
    body: "What goes into a batch. Ingredients are matched to your price list so each batch is costed.",
    cta: "Import recipes",
    icon: "M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3zM5 18a3 3 0 0 1 3-3h11M9 7h6M9 10h4",
  },
] as const;

export default function AddPage() {
  return (
    <>
      <PageHeader title="Add from a photo" subtitle="Take a picture or upload a PDF. Pick what it is so the right reader handles it." />
      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.href} className="flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
            <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <svg viewBox="0 0 24 24" className="h-6 w-6">
                <path d={k.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 className="mt-3 text-lg font-semibold text-stone-900">{k.title}</h2>
            <p className="mt-1 flex-1 text-sm text-stone-600">{k.body}</p>
            <Link href={k.href} className="mt-4 inline-flex items-center justify-center rounded-md bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
              {k.cta}
            </Link>
            {"alt" in k && (
              <Link href={k.alt.href} className="mt-2 text-center text-xs font-medium text-stone-600 underline underline-offset-2 hover:text-stone-900">
                {k.alt.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
