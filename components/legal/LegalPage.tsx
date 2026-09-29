import Link from "next/link";
import { LogoMark } from "@/components/marketing/Logo";
import { LEGAL_UPDATED } from "@/lib/legal";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

// Shared frame for /privacy and /terms: the landing page's dark look, a
// sticky contents list on wide screens, readable measure for the text.
export function LegalPage({ kicker, title, intro, sections }: { kicker: string; title: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#0c0b09] font-body text-[#cfc6b7] selection:bg-[#ff5b1f] selection:text-[#0c0b09]">
      <header className="border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="DoughTally Software home">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-[18px] font-bold tracking-tight text-white">DoughTally</span>
            <span className="rounded-sm border border-[#ff5b1f]/60 px-1.5 py-0.5 font-ledger text-[9px] tracking-[0.2em] text-[#ff5b1f] uppercase">Software</span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px]">
            <Link href="/privacy" className="text-[#a79f92] hover:text-white">Privacy</Link>
            <Link href="/terms" className="text-[#a79f92] hover:text-white">Terms</Link>
            <Link href="/" className="rounded-full border border-white/15 px-3.5 py-1.5 text-white hover:border-white/40">Home</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-8 sm:py-20">
        <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">{kicker}</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">{title}</h1>
        <p className="mt-3 font-ledger text-[12px] text-[#8f877b]">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-8 max-w-2xl text-[16px] leading-relaxed">{intro}</div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Contents" className="hidden lg:block">
            <ol className="sticky top-8 space-y-2 border-l border-white/10 pl-4 text-[13px]">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[#8f877b] hover:text-white">
                    <span className="mr-2 font-ledger text-[10px] text-[#ff5b1f]">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="max-w-2xl space-y-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-8">
                <h2 className="flex items-baseline gap-3 font-display text-2xl font-semibold tracking-tight text-white">
                  <span className="font-ledger text-xs text-[#ff5b1f]">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="legal-body mt-4 space-y-4 text-[15.5px] leading-relaxed [&_a]:text-white [&_a]:underline [&_a]:decoration-[#ff5b1f] [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-white [&_ul]:space-y-2">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-white/[0.07] py-6 text-center font-ledger text-[11px] tracking-wider text-[#6d665c]">
        © 2026 DoughTally Software · <Link href="/privacy" className="hover:text-white">Privacy</Link> · <Link href="/terms" className="hover:text-white">Terms</Link>
      </footer>
    </div>
  );
}
