"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import { LogoMark } from "@/components/marketing/Logo";
import { BrowserFrame, PhoneFrame } from "./primitives";
import { AlertMock, DashboardMock, GridMock, InvoiceReadMock, MarketMock, SwipeMock } from "./mockups";
import { HeroExample, IndustriesSection } from "./IndustryExamples";
import type { IndustryId } from "@/lib/industries";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const NAV = [
  ["Product", "#product"],
  ["How it works", "#how"],
  ["The numbers", "#numbers"],
  ["FAQ", "#faq"],
] as const;

const RECEIPT = [
  ["AP FLOUR 50# BG", "1", "21.75"],
  ["SUGAR GRAN 25#", "1", "18.90"],
  ["BUTTER SWT UNSLTD 36/1#", "1", "142.56"],
  ["EGGS LG GR-A 15DZ", "1", "46.50"],
  ["HVY CRM 40% 1QT", "6", "31.38"],
  ["VANILLA PURE 32OZ", "1", "38.00"],
];

// One butter line, followed to a croissant's margin. Every number is plain arithmetic.
const CHAIN = [
  { k: "the invoice line", v: 142.56, fmt: (n: number) => `$${n.toFixed(2)}`, d: "one 36 lb case of unsalted butter" },
  { k: "per pound", v: 3.96, fmt: (n: number) => `$${n.toFixed(2)}`, d: "$142.56 ÷ 36 lb. Last case was $3.40." },
  { k: "per croissant", v: 0.5694, fmt: (n: number) => `$${n.toFixed(4)}`, d: "all-in cost, with 1.25 lb of butter in every batch of 12" },
  { k: "croissant margin", v: 87.35, fmt: (n: number) => `${n.toFixed(2)}%`, d: "sold at $4.50. It was 88.64% on Friday." },
];

const TOUR = [
  {
    n: "01",
    tag: "read",
    title: "It reads the slip at the door.",
    body: "Photo on your phone, or a pile of emailed PDFs. Each line comes back as what it actually is and what that works out to per pound, per dozen, per gallon.",
    fine: "“BUTTER SWT UNSLTD 36/1#” is unsalted butter, 36 lb, $3.96 a pound.",
    mock: <InvoiceReadMock />,
    frame: "none" as const,
  },
  {
    n: "02",
    tag: "confirm",
    title: "Swipe the ones it isn't sure about.",
    body: "Sure matches go straight through. The rest become cards: right to confirm, left for the next guess. Confirm a supplier's wording once and it never asks again.",
    fine: "Nothing uncertain touches your costs until you say so.",
    mock: <SwipeMock />,
    frame: "phone" as const,
  },
  {
    n: "03",
    tag: "understand",
    title: "Price moves, in menu items.",
    body: "Butter up 16%? You see the three things you sell that use it, the margin each had yesterday and has today, and the exact fix: a new price, or a smaller portion.",
    fine: "Options are plain arithmetic you can check by hand.",
    mock: <AlertMock />,
    frame: "browser" as const,
    url: "doughtally.app/alerts",
  },
  {
    n: "04",
    tag: "look ahead",
    title: "The market, before your invoice.",
    body: "USDA wholesale eggs, butter and wheat every day, and the FAO's global food indexes, tied to the ingredients you actually buy.",
    fine: "Labelled as context. Never passed off as a forecast.",
    mock: <MarketMock />,
    frame: "browser" as const,
    url: "doughtally.app/market",
  },
  {
    n: "05",
    tag: "spreadsheet",
    title: "And a spreadsheet when you want one.",
    body: "Type an invoice in by hand, paste straight from Excel, export everything to CSV and bring it back. The app is never the only way to reach your numbers.",
    fine: "Tab, Enter and paste behave like a real spreadsheet.",
    mock: <GridMock />,
    frame: "browser" as const,
    url: "doughtally.app/invoices",
  },
];

const FAQ = [
  ["What can it read?", "Phone photos of printed invoices and packing slips, and PDF invoices from email. One at a time from Scan, or up to 25 at once. Menus and recipes have their own import. If a photo is too blurry, the invoice opens in a grid for you to type."],
  ["What if it gets something wrong?", "Anything it isn't sure of waits for you in a review queue, and you can fix any line later. It never quietly changes a cost on a guess."],
  ["Do I need recipes before I start?", "No. Scanning builds your price history from day one. Add recipes and menu items when you're ready (typed, pasted, or read from a photo) and margins appear straight away."],
  ["Where does the market data come from?", "The USDA's Agricultural Marketing Service for daily wholesale eggs, butter and wheat, and the UN FAO Food Price Index. Wholesale markets don't move exactly like your distributor, so it's shown as direction only."],
  ["Can I get my data out?", "Any time, as a CSV. Edit it in a spreadsheet and import it back. Old invoices can be imported in bulk without changing today's costs."],
  ["Who can see my numbers?", "Only your account. Every row is locked to your business by the database itself, not just the app."],
];

const TICKER = [
  { name: "Unsalted butter", unit: "lb", base: 3.96 },
  { name: "Large eggs", unit: "doz", base: 3.1 },
  { name: "Bread flour", unit: "lb", base: 0.53 },
  { name: "Heavy cream", unit: "qt", base: 5.23 },
  { name: "Granulated sugar", unit: "lb", base: 0.76 },
];

function Arrow({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

// Everyone sees the same page: Log in and Get started. Someone already
// signed in who taps Log in goes straight to their dashboard (/login does that).
// Two versions of one page: "general" (the home page — any business that buys
// supplies on invoices and sells what it makes, food first) and "food" (the
// original food-business page, at /food). Only the wording, the hero's right
// side and the Industries section differ. `enabled`: ENABLED_INDUSTRIES, read
// on the server, for the Industries cards.
const COPY = {
  general: {
    strip: "For businesses that buy supplies on invoices",
    h1: (
      <>
        Know what every product <span className="text-[#ff5b1f]">really costs you.</span>
      </>
    ),
    sub: "Snap a photo of a supplier invoice. Your costs and margins update, and you get warned before a price change eats your profit.",
    units: "per lb, gram, stem",
    marquee: ["Home bakeries", "Caterers", "Food trucks", "Coffee carts", "Florists", "Jewelers", "Makers & small shops"],
    leak: "Supplier prices move every week. Your prices move a few times a year. The gap between them is invisible on any one invoice, which is exactly where a small business loses its margin.",
    market: "The USDA's Agricultural Marketing Service for daily wholesale eggs, butter and wheat, and the UN FAO Food Price Index — food commodities only for now. Wholesale markets don't move exactly like your distributor, so it's shown as direction only.",
    footer: "DoughTally Software. Invoice-to-margin tracking for small businesses that make what they sell.",
  },
  food: {
    strip: "For bakeries, trucks, caterers & carts",
    h1: (
      <>
        Snap the supplier invoice. See what it did to your <span className="text-[#ff5b1f]">margins.</span>
      </>
    ),
    sub: "DoughTally reads every delivery slip, keeps what each ingredient really costs, and tells you which menu items just got less profitable, and what to charge instead.",
    units: "per lb, dozen, gal",
    marquee: ["Home bakeries", "Food trucks", "Caterers", "Coffee carts", "Market stalls", "Ghost kitchens", "Pop-ups"],
    leak: "Wholesale prices move every week. Menu prices move a few times a year. The gap between them is invisible on any one invoice, which is exactly where a small food business loses its margin.",
    market: FAQ[3][1],
    footer: "DoughTally Software. Invoice-to-menu margin tracking for small food businesses.",
  },
} as const;

export function Landing({ variant = "general", enabled = [] }: { variant?: "general" | "food"; enabled?: IndustryId[] }) {
  const copy = COPY[variant];
  const faq = FAQ.map(([q, a], i) => [q, i === 3 ? copy.market : a] as const);
  const root = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const appHref = "/login";
  const startHref = "/signup";

  // Smooth, weighted scrolling that GSAP's ScrollTrigger reads from. Off for
  // people who've asked their OS for less motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09, anchors: { offset: -72 } });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // The drawer freezes the page behind it.
  useEffect(() => {
    if (menuOpen) lenisRef.current?.stop();
    else lenisRef.current?.start();
    document.documentElement.style.overflow = menuOpen ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          desktop: "(min-width: 1024px)",
        },
        (ctx) => {
          const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
          if (!motion) return;

          // ---- hero: the masthead drops in, the price line draws itself
          const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
          intro
            .from(q(".mh-char"), { yPercent: 115, rotate: 7, duration: 1.4, stagger: 0.045 })
            .from(q(".mh-soft"), { clipPath: "inset(0 100% 0 0)", duration: 1.1, ease: "steps(8)" }, 0.55)
            .from(q(".hero-line path"), { strokeDashoffset: 1600, duration: 2.4, ease: "power2.inOut" }, 0.2)
            .from(q(".hero-fade"), { y: 28, opacity: 0, duration: 1, stagger: 0.08 }, 0.7)
            .from(q(".hero-ticker"), { y: 60, rotate: -4, opacity: 0, duration: 1.3 }, 0.9);

          // …and gets pulled apart as you scroll away from it
          gsap.timeline({ scrollTrigger: { trigger: q(".hero")[0], start: "top top", end: "bottom top", scrub: 0.6 } })
            .to(q(".mh-row-1"), { xPercent: -10, ease: "none" }, 0)
            .to(q(".mh-char"), { yPercent: (i) => (i % 2 ? -30 : 25), rotate: (i) => (i % 2 ? -6 : 5), ease: "none" }, 0)
            .to(q(".hero-line"), { yPercent: -60, opacity: 0, ease: "none" }, 0)
            .to(q(".hero-ticker"), { y: -120, rotate: 3, ease: "none" }, 0);

          // cursor spotlight on the hero
          const hero = q(".hero")[0] as HTMLElement;
          const setX = gsap.quickTo(hero, "--mx", { duration: 0.6, ease: "power3" });
          const setY = gsap.quickTo(hero, "--my", { duration: 0.6, ease: "power3" });
          const onMove = (e: PointerEvent) => {
            const r = hero.getBoundingClientRect();
            setX(((e.clientX - r.left) / r.width) * 100);
            setY(((e.clientY - r.top) / r.height) * 100);
          };
          hero.addEventListener("pointermove", onMove);

          // ---- marquee leans into the scroll
          const lean = gsap.quickTo(q(".marquee-track"), "skewX", { duration: 0.4, ease: "power3" });
          ScrollTrigger.create({
            trigger: q(".marquee")[0],
            start: "top bottom",
            end: "bottom top",
            onUpdate: (self) => lean(gsap.utils.clamp(-14, 14, self.getVelocity() / -220)),
          });

          // ---- headings: lines rise out of a mask
          q("[data-lines]").forEach((el: Element) => {
            SplitText.create(el, {
              type: "lines",
              mask: "lines",
              autoSplit: true,
              onSplit: (self) =>
                gsap.from(self.lines, {
                  yPercent: 110,
                  duration: 1.1,
                  ease: "expo.out",
                  stagger: 0.09,
                  scrollTrigger: { trigger: el, start: "top 85%", once: true },
                }),
            });
          });

          // ---- the problem paragraph lights up word by word
          gsap.fromTo(
            q(".lit-word"),
            { opacity: 0.12 },
            { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: q(".lit")[0], start: "top 75%", end: "bottom 45%", scrub: true } },
          );
          gsap.from(q(".lit-hit"), {
            scale: 0.4,
            rotate: -12,
            opacity: 0,
            ease: "back.out(3)",
            duration: 0.7,
            scrollTrigger: { trigger: q(".lit")[0], start: "bottom 55%", once: true },
          });

          // ---- one line, followed: the receipt prints, then the numbers run
          const counters = q(".chain-val") as HTMLElement[];
          const runCounter = (el: HTMLElement, i: number) => {
            const o = { n: 0 };
            return gsap.to(o, {
              n: CHAIN[i].v,
              duration: 1,
              ease: "power2.out",
              onUpdate: () => (el.textContent = CHAIN[i].fmt(o.n)),
            });
          };
          // Plays once as it comes into view: no pinning, so the page keeps moving.
          const story = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
          story
            .from(q(".rc-paper"), { yPercent: -102, duration: 0.9, ease: "power2.inOut" })
            .from(q(".rc-row"), { opacity: 0, x: -10, stagger: 0.07, duration: 0.3 }, 0.45)
            .to(q(".rc-hit"), { backgroundColor: "#ff5b1f", color: "#0c0b09", duration: 0.25 })
            .from(q(".chain-wire"), { scaleY: 0, transformOrigin: "top", ease: "none", duration: 1.6 }, "<");
          q(".chain-step").forEach((el: Element, i: number) => {
            story.from(el, { opacity: 0.08, x: desktop ? 40 : 0, y: desktop ? 0 : 24, duration: 0.45 }, i === 0 ? "<" : "<+0.24");
            story.add(runCounter(counters[i], i), "<");
          });
          story.from(q(".chain-stamp"), { scale: 2.4, rotate: -22, opacity: 0, ease: "back.out(2)", duration: 0.55 });
          ScrollTrigger.create({ trigger: q(".story")[0], start: "top 72%", once: true, onEnter: () => story.play() });

          // ---- steps: giant outline numerals fill as they pass
          q(".step").forEach((el: Element) => {
            const s = gsap.utils.selector(el);
            gsap.fromTo(s(".step-fill"), { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "top 35%", scrub: true } });
          });

          // ---- closing line fills left to right
          gsap.fromTo(
            q(".cta-fill"),
            { clipPath: "inset(0 100% 0 0)" },
            { clipPath: "inset(0 0% 0 0)", ease: "none", scrollTrigger: { trigger: q(".cta")[0], start: "top 75%", end: "center 45%", scrub: true } },
          );

          // ---- footer wordmark rises
          gsap.from(q(".ft-char"), { yPercent: 100, stagger: 0.04, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: q(".ft-mark")[0], start: "top 95%", once: true } });

          // ---- magnetic buttons
          const offs: (() => void)[] = [];
          q("[data-magnet]").forEach((el: Element) => {
            const btn = el as HTMLElement;
            const mx = gsap.quickTo(btn, "x", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
            const my = gsap.quickTo(btn, "y", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
            const move = (e: PointerEvent) => {
              const r = btn.getBoundingClientRect();
              mx((e.clientX - r.left - r.width / 2) * 0.35);
              my((e.clientY - r.top - r.height / 2) * 0.45);
            };
            const leave = () => {
              mx(0);
              my(0);
            };
            btn.addEventListener("pointermove", move);
            btn.addEventListener("pointerleave", leave);
            offs.push(() => {
              btn.removeEventListener("pointermove", move);
              btn.removeEventListener("pointerleave", leave);
            });
          });

          return () => {
            hero.removeEventListener("pointermove", onMove);
            offs.forEach((f) => f());
          };
        },
      );
    },
    { scope: root },
  );

  const masthead = (word: string) =>
    word.split("").map((c, i) => (
      <span key={i} className="inline-block overflow-hidden pb-[0.06em] align-bottom">
        <span className="mh-char inline-block will-change-transform">{c}</span>
      </span>
    ));

  return (
    <div ref={root} className="dt-grain relative flex min-h-full flex-1 flex-col overflow-x-clip bg-[#0c0b09] font-body text-[#ece4d6] selection:bg-[#ff5b1f] selection:text-[#0c0b09]">
      {/* ------------------------------------------------------------ header */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-[#0c0b09]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" aria-label="DoughTally Software home" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-[19px] leading-none font-bold tracking-tight text-white">DoughTally</span>
            <span className="rounded-sm border border-[#ff5b1f]/60 px-1.5 py-0.5 font-ledger text-[9px] tracking-[0.2em] text-[#ff5b1f] uppercase">Software</span>
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {NAV.map(([label, href], i) => (
              <a key={href} href={href} className="group rounded-full px-3 py-1.5 text-[13px] text-[#a79f92] transition hover:bg-white/[0.06] hover:text-white">
                <span className="mr-1 font-ledger text-[10px] text-[#ff5b1f]/80">0{i + 1}</span>
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href={appHref} className="rounded-full px-3.5 py-2 text-[13px] font-medium text-[#ece4d6] transition hover:text-white">
              Log in
            </Link>
            <Link href="/signup" className="hidden rounded-full bg-[#ff5b1f] px-4 py-2 text-[13px] font-semibold text-[#0c0b09] transition hover:bg-[#ff7a45] sm:inline-flex">
              Get started
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="site-drawer"
              onClick={() => setMenuOpen((o) => !o)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 md:hidden"
            >
              <span className={`absolute h-[1.5px] w-4 bg-white transition duration-300 ${menuOpen ? "rotate-45" : "-translate-y-[5px]"}`} />
              <span className={`absolute h-[1.5px] w-4 bg-white transition duration-300 ${menuOpen ? "scale-x-0 opacity-0" : ""}`} />
              <span className={`absolute h-[1.5px] w-4 bg-white transition duration-300 ${menuOpen ? "-rotate-45" : "translate-y-[5px]"}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- mobile drawer */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-500 md:hidden ${menuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        id="site-drawer"
        aria-label="Menu"
        inert={!menuOpen}
        className={`fixed top-0 right-0 bottom-0 z-50 flex w-[86vw] max-w-sm flex-col border-l border-white/10 bg-[#14120f] px-6 pt-20 pb-8 transition-transform duration-500 ease-[cubic-bezier(.7,0,.2,1)] md:hidden ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white">
          ✕
        </button>
        <p className="font-ledger text-[10px] tracking-[0.25em] text-[#8f877b] uppercase">Sections</p>
        <nav className="mt-4 flex flex-col">
          {NAV.map(([label, href], i) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              style={{ transitionDelay: menuOpen ? `${120 + i * 70}ms` : "0ms" }}
              className={`group flex items-baseline gap-3 border-b border-white/[0.07] py-4 transition duration-500 ${menuOpen ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}`}
            >
              <span className="font-ledger text-xs text-[#ff5b1f]">0{i + 1}</span>
              <span className="font-display text-3xl font-semibold tracking-tight text-white">{label}</span>
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Link href={startHref} className="rounded-full bg-[#ff5b1f] px-5 py-3.5 text-center text-sm font-semibold text-[#0c0b09]">
            Get started
          </Link>
          <Link href="/login" className="rounded-full border border-white/15 px-5 py-3.5 text-center text-sm font-medium text-white">
            Log in
          </Link>
        </div>
      </aside>

      <main className="flex-1">
        {/* ---------------------------------------------------------- hero */}
        <section
          className="hero relative overflow-hidden pt-24 [--mx:70] [--my:30]"
          style={{ backgroundImage: "radial-gradient(38rem 30rem at calc(var(--mx) * 1%) calc(var(--my) * 1%), rgba(255,91,31,0.16), transparent 70%)" }}
        >
          <svg className="hero-line pointer-events-none absolute inset-x-0 top-[34%] hidden h-[46%] w-full sm:block" viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden>
            <path
              d="M0 330 L140 318 L230 322 L320 290 L410 300 L520 250 L600 262 L700 214 L790 226 L880 170 L990 188 L1080 120 L1180 140 L1270 86 L1380 104 L1480 40 L1600 58"
              fill="none"
              stroke="#ff5b1f"
              strokeOpacity="0.45"
              strokeWidth="2"
              strokeDasharray="1600"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="relative mx-auto max-w-[1400px] px-4 sm:px-8">
            <div className="hero-fade flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-2 font-ledger text-[10px] tracking-[0.2em] text-[#8f877b] uppercase sm:text-[11px]">
              <span>Invoice → cost → recipe → margin</span>
              <span className="hidden sm:inline">{copy.strip}</span>
              <span className="text-[#ff5b1f]">● Live on doughtally.app</span>
            </div>

            <p className="sr-only">DoughTally Software</p>
            <div aria-hidden className="mh-row-1 mt-6 flex flex-wrap items-end gap-x-[1.6vw] gap-y-3 font-display text-[13vw] leading-[0.8] font-extrabold tracking-[-0.055em] text-white uppercase sm:mt-8 sm:text-[11.5vw] lg:text-[10vw]">
              <span className="whitespace-nowrap">
                {masthead("Dough")}
                <span className="text-[#ff5b1f]">{masthead("Tally")}</span>
              </span>
              <span className="mh-soft mb-[0.12em] inline-flex items-center gap-[0.5em] rounded-sm border-2 border-[#ece4d6] px-[0.55em] py-[0.35em] font-ledger text-[4.2vw] leading-none font-semibold tracking-[0.22em] text-[#ece4d6] sm:text-[2.1vw] lg:text-[1.6vw]">
                <span className="h-[0.5em] w-[0.5em] rounded-full bg-[#ff5b1f]" />
                SOFTWARE
              </span>
            </div>

            <div className="relative mt-10 grid gap-12 pb-16 lg:mt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <h1 className="hero-fade max-w-[19ch] font-display text-[2.35rem] leading-[1.02] font-bold tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.5rem]">
                  {copy.h1}
                </h1>
                <p className="hero-fade mt-5 max-w-xl text-[17px] leading-relaxed text-[#b5ad9f] sm:text-[19px]">
                  {copy.sub}
                </p>
                <ol className="hero-fade mt-8 grid max-w-xl gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-3">
                  {[
                    ["01", "Snap the invoice", "photo or PDF"],
                    ["02", "Costs update", copy.units],
                    ["03", "Get the fix", "new price or portion"],
                  ].map(([n, what, how]) => (
                    <li key={n} className="flex items-baseline gap-3 bg-[#0c0b09] px-4 py-3 sm:block">
                      <span className="font-ledger text-[11px] text-[#ff5b1f]">{n}</span>
                      <span className="block text-[15px] font-semibold text-white sm:mt-1">{what}</span>
                      <span className="block font-ledger text-[11px] text-[#8f877b]">{how}</span>
                    </li>
                  ))}
                </ol>
                <div className="hero-fade mt-8 flex flex-wrap items-center gap-3">
                  <Link data-magnet href={startHref} className="group inline-flex items-center gap-2.5 rounded-full bg-[#ff5b1f] px-7 py-4 text-[15px] font-semibold text-[#0c0b09] transition-colors hover:bg-[#ff7a45]">
                    Start tracking margins
                    <Arrow className="h-4 w-4 transition group-hover:translate-x-1" />
                  </Link>
                  <a href="#numbers" className="rounded-full border border-white/15 px-6 py-4 text-[15px] font-medium text-white transition hover:border-white/40">
                    See it on a real invoice
                  </a>
                </div>
                <p className="hero-fade mt-5 font-ledger text-[11px] tracking-wide text-[#7d766b]">free to use right now · no card · works on your phone</p>
              </div>

              <div className="relative flex justify-center lg:justify-end">
                {variant === "food" ? <Ticker /> : <HeroExample />}
                <div className="dt-spin pointer-events-none absolute -top-14 -left-4 hidden h-28 w-28 sm:block lg:-left-10" aria-hidden>
                  <svg viewBox="0 0 120 120" className="h-full w-full">
                    <defs>
                      <path id="badge-circle" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" />
                    </defs>
                    <text className="fill-[#ece4d6] font-ledger text-[9.5px] uppercase">
                      <textPath href="#badge-circle" textLength="286" lengthAdjust="spacing">DoughTally Software ✺ margin tracking ✺ </textPath>
                    </text>
                    <circle cx="60" cy="60" r="7" fill="#ff5b1f" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {variant === "general" && <IndustriesSection enabled={enabled} />}

        {/* ------------------------------------------------------- marquee */}
        <section aria-label="Who it's for" className="marquee overflow-hidden border-y border-white/10 bg-[#ff5b1f] py-4 text-[#0c0b09]">
          <div className="marquee-track">
            <div className="dt-marquee flex w-max whitespace-nowrap">
              {[0, 1].map((k) => (
                <div key={k} aria-hidden={k === 1} className="flex items-center">
                  {copy.marquee.map((w) => (
                    <span key={w} className="flex items-center font-display text-3xl font-extrabold tracking-tight uppercase sm:text-5xl">
                      <span className="px-6">{w}</span>
                      <span className="text-2xl sm:text-4xl">✺</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- problem */}
        <section className="relative mx-auto max-w-[1400px] px-4 py-24 sm:px-8 sm:py-32">
          <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">The quiet leak</p>
          <p className="lit mt-8 max-w-[22ch] font-display text-[9.5vw] leading-[1] font-semibold tracking-[-0.035em] text-white sm:text-[6vw] lg:text-[4.4vw]">
            {"A case of butter went up twenty dollars last month. Your croissants still cost".split(" ").map((w, i) => (
              <span key={i} className="lit-word">
                {w}{" "}
              </span>
            ))}
            <span className="lit-word relative inline-block">
              $4.50.
              <span className="lit-hit absolute -top-3 -right-4 rotate-6 rounded-sm bg-[#ff5b1f] px-2 py-0.5 font-ledger text-[0.18em] leading-tight font-semibold tracking-wider whitespace-nowrap text-[#0c0b09] uppercase sm:-right-10">
                −1.3 pts margin
              </span>
            </span>
          </p>
          <div className="mt-16 grid gap-x-16 gap-y-6 text-[17px] leading-relaxed text-[#a79f92] md:grid-cols-[1fr_1fr] lg:ml-[30%]">
            <p>{copy.leak}</p>
            <p>Nobody has time to re-cost every recipe when a delivery comes in. So we made the invoice do it: scan it, and the change shows up on the items it actually touches.</p>
          </div>
        </section>

        {/* ---------------------------------------------- receipt → margin */}
        <section id="numbers" className="story relative scroll-mt-16 border-t border-white/10">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-28">
            <div>
              <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">Follow one line</p>
              <h2 data-lines className="mt-4 font-display text-4xl leading-[0.98] font-bold tracking-[-0.035em] text-white sm:text-5xl">
                From the slip to the menu board.
              </h2>
              <div className="relative mt-10 max-w-md">
                {/* the printer slot */}
                <div className="relative z-10 h-3 rounded-full bg-[#2a2620] shadow-[inset_0_2px_4px_rgba(0,0,0,.8)]" />
                <div className="-mt-1.5 overflow-hidden px-3">
                  <div className="rc-paper dt-receipt bg-[#f3ebdd] px-5 pt-6 pb-10 font-ledger text-[12px] text-[#2b2620] shadow-2xl">
                    <p className="text-center text-[13px] font-semibold tracking-[0.2em]">LONE STAR FOODSERVICE</p>
                    <p className="mt-1 text-center text-[10px] text-[#6d665c]">INV 7719-204583 · 09/26 · ROUTE 14</p>
                    <div className="my-3 border-t border-dashed border-[#2b2620]/40" />
                    {RECEIPT.map(([item, qty, amt]) => (
                      <div key={item} className={`rc-row flex justify-between gap-3 px-1 py-[3px] ${item.startsWith("BUTTER") ? "rc-hit" : ""}`}>
                        <span className="truncate">{item}</span>
                        <span className="shrink-0 tabular-nums">
                          {qty} × {amt}
                        </span>
                      </div>
                    ))}
                    <div className="my-3 border-t border-dashed border-[#2b2620]/40" />
                    <div className="flex justify-between font-semibold">
                      <span>TOTAL</span>
                      <span className="tabular-nums">$299.09</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <ol className="relative flex flex-col gap-5 lg:pl-10">
              <span aria-hidden className="chain-wire absolute top-2 bottom-2 left-[7px] hidden w-px bg-gradient-to-b from-[#ff5b1f] via-[#ff5b1f]/60 to-transparent lg:block" />
              {CHAIN.map((c, i) => (
                <li key={c.k} className="chain-step relative lg:pl-8">
                  <span aria-hidden className="absolute top-3 -left-[3px] hidden h-[15px] w-[15px] rounded-full border-2 border-[#ff5b1f] bg-[#0c0b09] lg:block" />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-white/10 pb-4">
                    <span className="font-ledger text-[11px] tracking-[0.2em] text-[#8f877b] uppercase">
                      {String(i + 1).padStart(2, "0")} / {c.k}
                    </span>
                    <span className="chain-val font-display text-4xl font-bold tracking-tight text-white tabular-nums sm:text-5xl">{c.fmt(c.v)}</span>
                  </div>
                  <p className="mt-2 text-[15px] text-[#a79f92]">{c.d}</p>
                </li>
              ))}
              <li className="chain-stamp mt-2 self-start rounded-sm border-2 border-[#ff5b1f] px-4 py-2 font-ledger text-sm font-semibold tracking-[0.15em] text-[#ff5b1f] uppercase lg:ml-8 lg:-rotate-3">
                Fix: $5.02, or 2.82 oz less butter a batch
              </li>
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------- product tour */}
        <TourStrip />

        {/* ------------------------------------------------- how it works */}
        <section id="how" className="relative scroll-mt-16 border-t border-white/10">
          <div className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8 sm:py-28">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
              <h2 data-lines className="font-display text-4xl leading-[0.98] font-bold tracking-[-0.035em] text-white sm:text-6xl">
                Set up in one afternoon.
              </h2>
              <p className="max-w-md text-[17px] text-[#a79f92] lg:justify-self-end">No accountant, no integrations, no card. Already keep a spreadsheet? Paste it straight in. Have a menu and recipe cards? Photograph them.</p>
            </div>
            <ol className="mt-16 flex flex-col">
              {[
                ["Photograph your menu and recipes", "We read them, pick the right ingredients (bread flour in the croissants, not the muffins) and convert the cups and sticks into what you buy."],
                ["Scan the next delivery", "Every line gets costed per pound, per dozen, per gallon. The first invoice fills your price list in."],
                ["Watch the margins", "When a price moves past your threshold you get the affected items and two ways to fix each one."],
              ].map(([title, body], i) => (
                <li key={title} className="step grid items-center gap-4 border-t border-white/10 py-10 last:border-b sm:grid-cols-[auto_1fr_1fr] sm:gap-12">
                  <span className="relative font-display text-[5.5rem] leading-none font-extrabold tracking-tighter sm:text-[8rem]">
                    <span className="dt-outline text-white/30">{i + 1}</span>
                    <span aria-hidden className="step-fill absolute inset-0 text-[#ff5b1f]">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h3>
                  <p className="text-[16px] leading-relaxed text-[#a79f92]">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------- dashboard glimpse */}
        <section className="relative overflow-hidden border-t border-white/10 bg-[#11100d]">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-28 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div>
              <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">The control room</p>
              <h2 data-lines className="mt-4 font-display text-4xl leading-[0.98] font-bold tracking-[-0.035em] text-white sm:text-5xl">
                Every item, every margin, one screen.
              </h2>
              <p className="mt-6 max-w-sm text-[17px] text-[#a79f92]">What moved, what it touched, what needs a decision today. Built for a quick look between batches.</p>
            </div>
            <div className="-mr-[20vw] rotate-[-2deg] lg:-mr-[12vw]">
              <BrowserFrame url="doughtally.app/dashboard">
                <DashboardMock />
              </BrowserFrame>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- faq */}
        <section id="faq" className="scroll-mt-16 border-t border-white/10">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 data-lines className="font-display text-4xl leading-[0.98] font-bold tracking-[-0.035em] text-white sm:text-5xl">
                Fair questions.
              </h2>
              <p className="mt-5 max-w-xs text-[#a79f92]">
                Anything else,{" "}
                <Link href={appHref} className="text-white underline decoration-[#ff5b1f] underline-offset-4">
                  log in
                </Link>{" "}
                and poke around. It&apos;s all in the product today.
              </p>
            </div>
            <div className="border-t border-white/10">
              {faq.map(([q, a], i) => (
                <details key={q} className="group border-b border-white/10">
                  <summary className="flex cursor-pointer list-none items-center gap-5 py-6 [&::-webkit-details-marker]:hidden">
                    <span className="font-ledger text-[11px] text-[#ff5b1f]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 font-display text-lg font-semibold tracking-tight text-white sm:text-xl">{q}</span>
                    <span aria-hidden className="relative h-4 w-4 shrink-0">
                      <span className="absolute top-1/2 left-0 h-px w-4 bg-white" />
                      <span className="absolute top-1/2 left-0 h-px w-4 rotate-90 bg-white transition duration-300 group-open:rotate-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pr-8 pb-6 pl-9 text-[16px] leading-relaxed text-[#a79f92]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- cta */}
        <section className="cta relative overflow-hidden border-t border-white/10 px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-[1400px]">
            <p className="relative font-display text-[11vw] leading-[0.9] font-extrabold tracking-[-0.05em] uppercase sm:text-[7.5vw]">
              <span className="dt-outline block text-white/40">Stop hearing about price hikes from your bank.</span>
              <span aria-hidden className="cta-fill absolute inset-0 block text-white">
                Stop hearing about price hikes from your <span className="text-[#ff5b1f]">bank.</span>
              </span>
            </p>
            <div className="mt-14 flex flex-wrap items-center gap-4">
              <Link data-magnet href={startHref} className="group inline-flex items-center gap-2.5 rounded-full bg-[#ff5b1f] px-8 py-5 text-base font-semibold text-[#0c0b09] transition-colors hover:bg-[#ff7a45]">
                Create your account
                <Arrow className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link href="/login" className="rounded-full border border-white/15 px-7 py-5 text-base font-medium text-white transition hover:border-white/40">
                I already have one
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------- footer */}
      <footer className="relative overflow-hidden border-t border-white/10">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 pt-14 text-sm sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <p className="max-w-xs text-[#8f877b]">{copy.footer}</p>
          <ul className="space-y-2">
            {NAV.map(([label, href]) => (
              <li key={href}>
                <a href={href} className="text-[#a79f92] hover:text-white">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <ul className="space-y-2">
            {[["Log in", "/login"], ["Create an account", "/signup"]].map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-[#a79f92] hover:text-white">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <p aria-hidden className="ft-mark mt-10 flex justify-center overflow-hidden font-display text-[17vw] leading-[0.78] font-extrabold tracking-[-0.06em] text-[#1c1915] uppercase select-none">
          {"DoughTally".split("").map((c, i) => (
            <span key={i} className="ft-char inline-block">
              {c}
            </span>
          ))}
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/10 py-5 text-center font-ledger text-[11px] tracking-wider text-[#6d665c]">
          <span>© 2026 DoughTally Software</span>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-white">Cookie Policy</Link>
        </p>
      </footer>
    </div>
  );
}

// The product tour as its own sideways strip: swipe, drag, or use the
// arrows. It never hijacks the page's vertical scroll.
function TourStrip() {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const card = e.target as HTMLElement;
          card.dataset.in = e.intersectionRatio > 0.35 ? "1" : "0";
        }
      },
      { root: el, threshold: [0, 0.35, 0.6, 0.9] },
    );
    el.querySelectorAll("[data-card]").forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector<HTMLElement>("[data-card]");
    if (el && card) el.scrollBy({ left: dir * (card.offsetWidth + 24), behavior: "smooth" });
  };

  return (
    <section id="product" aria-label="The product" className="relative scroll-mt-16 border-t border-white/10 bg-[#11100d] py-20 sm:py-24">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-6 px-4 sm:px-8">
        <div>
          <p className="font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">The product</p>
          <h2 data-lines className="mt-3 font-display text-4xl leading-[0.95] font-extrabold tracking-[-0.04em] text-white uppercase sm:text-5xl">
            Door to <span className="dt-outline-ember">menu</span> board.
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-ledger text-[12px] text-[#8f877b] tabular-nums">
            <span className="text-white">{String(active + 1).padStart(2, "0")}</span> / {String(TOUR.length).padStart(2, "0")}
          </span>
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-[#ff5b1f] hover:text-[#ff5b1f] disabled:opacity-30" disabled={progress < 0.01}>
            <Arrow className="h-4 w-4 rotate-180" />
          </button>
          <button type="button" aria-label="Next" onClick={() => step(1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff5b1f] text-[#0c0b09] transition hover:bg-[#ff7a45] disabled:opacity-30" disabled={progress > 0.99}>
            <Arrow className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={track}
        tabIndex={0}
        aria-label="Product tour, scroll sideways"
        onScroll={(e) => {
          const el = e.currentTarget;
          const max = Math.max(1, el.scrollWidth - el.clientWidth);
          setProgress(el.scrollLeft / max);
          // The card at the left edge is the current one; at the very end,
          // the last card (it can't scroll all the way to the edge).
          const card = el.querySelector<HTMLElement>("[data-card]");
          const stride = card ? card.offsetWidth + 24 : el.clientWidth;
          setActive(el.scrollLeft >= max - 2 ? TOUR.length - 1 : Math.min(TOUR.length - 1, Math.round(el.scrollLeft / stride)));
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !track.current) return;
          drag.current = { x: e.clientX, left: track.current.scrollLeft };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (drag.current && track.current) track.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          drag.current = null;
          setDragging(false);
        }}
        className={`mt-10 flex scroll-px-4 gap-6 overflow-x-auto px-4 pb-4 outline-none [scrollbar-width:none] sm:scroll-px-8 sm:px-8 xl:scroll-px-[max(2rem,calc((100vw-1400px)/2+2rem))] xl:px-[max(2rem,calc((100vw-1400px)/2+2rem))] [&::-webkit-scrollbar]:hidden ${dragging ? "cursor-grabbing select-none" : "cursor-grab snap-x snap-mandatory"}`}
      >
        {TOUR.map((t, i) => (
          <article
            key={t.n}
            data-card={i}
            className="group relative grid w-[86vw] shrink-0 snap-start gap-8 overflow-hidden rounded-xl border border-white/10 bg-[#0c0b09] p-6 sm:w-[76vw] sm:p-8 lg:w-[min(1080px,74vw)] lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-10 lg:p-10"
          >
            <div className="relative transition duration-700 ease-out group-data-[in=0]:translate-y-3 group-data-[in=0]:opacity-40">
              <span aria-hidden className="pointer-events-none absolute -top-10 -left-1 font-display text-[7rem] leading-none font-extrabold text-white/[0.05] sm:text-[9rem]">
                {t.n}
              </span>
              <p className="relative font-ledger text-[11px] tracking-[0.25em] text-[#ff5b1f] uppercase">
                {t.n} / {t.tag}
              </p>
              <h3 className="relative mt-3 font-display text-3xl leading-[1] font-bold tracking-[-0.03em] text-white sm:text-4xl">{t.title}</h3>
              <p className="relative mt-4 max-w-md text-[16px] leading-relaxed text-[#b5ad9f]">{t.body}</p>
              <p className="relative mt-5 max-w-md border-l-2 border-[#ff5b1f] pl-3 font-ledger text-[12px] leading-relaxed text-[#8f877b]">{t.fine}</p>
            </div>
            <div className="pointer-events-none relative max-h-[58svh] overflow-hidden rounded-2xl transition duration-700 ease-out group-data-[in=0]:scale-90 group-data-[in=0]:rotate-2 group-data-[in=0]:opacity-30">
              {t.frame === "phone" ? <PhoneFrame>{t.mock}</PhoneFrame> : t.frame === "browser" ? <BrowserFrame url={t.url ?? "doughtally.app"}>{t.mock}</BrowserFrame> : t.mock}
            </div>
          </article>
        ))}
        <div aria-hidden className="w-px shrink-0" />
      </div>

      <div className="mx-auto mt-6 flex max-w-[1400px] items-center gap-4 px-4 sm:px-8">
        <span className="h-px flex-1 bg-white/10">
          <span className="block h-px origin-left bg-[#ff5b1f] transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
        </span>
        <span className="font-ledger text-[11px] tracking-[0.2em] text-[#6d665c] uppercase">drag · swipe · arrows</span>
      </div>
    </section>
  );
}

// A hand-cut price board that keeps moving, like the market does.
function Ticker() {
  const [prices, setPrices] = useState(TICKER.map((t) => ({ now: t.base, prev: t.base })));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setPrices((cur) =>
        cur.map((p, i) => {
          if (Math.random() > 0.45) return { ...p, prev: p.now };
          const drift = (Math.random() - 0.42) * TICKER[i].base * 0.04;
          return { prev: p.now, now: Math.max(TICKER[i].base * 0.8, +(p.now + drift).toFixed(2)) };
        }),
      );
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="hero-ticker relative w-full max-w-md rotate-[1.5deg] rounded-md border border-white/10 bg-[#14120f]/90 p-5 shadow-[0_40px_120px_-30px_rgba(255,91,31,0.35)] backdrop-blur">
      <div className="flex items-center justify-between font-ledger text-[10px] tracking-[0.2em] text-[#8f877b] uppercase">
        <span className="dt-caret">your costs, live</span>
        <span>per unit</span>
      </div>
      <ul className="mt-4 divide-y divide-white/[0.06]">
        {TICKER.map((t, i) => {
          const p = prices[i];
          const pct = ((p.now - t.base) / t.base) * 100;
          const up = p.now > p.prev;
          const down = p.now < p.prev;
          return (
            <li key={t.name} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-[14px] text-[#ece4d6]">{t.name}</span>
              <span className="flex items-baseline gap-3 font-ledger tabular-nums">
                <span className={`text-[15px] transition-colors duration-700 ${up ? "text-[#ff5b1f]" : down ? "text-[#7fd48a]" : "text-white"}`}>
                  ${p.now.toFixed(2)}
                  <span className="text-[11px] text-[#6d665c]">/{t.unit}</span>
                </span>
                <span className={`w-14 text-right text-[11px] ${pct > 0.05 ? "text-[#ff5b1f]" : pct < -0.05 ? "text-[#7fd48a]" : "text-[#6d665c]"}`}>
                  {pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "•"} {Math.abs(pct).toFixed(1)}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between rounded-sm bg-[#ff5b1f]/10 px-3 py-2 font-ledger text-[11px] text-[#ffb08a]">
        <span>3 menu items affected</span>
        <span>review →</span>
      </div>
    </div>
  );
}
