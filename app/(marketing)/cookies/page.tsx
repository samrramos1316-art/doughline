import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, CONTACT_EMAIL, SITE, COOKIES_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookie Policy · DoughTally Software" };
export const viewport: Viewport = { themeColor: "#0c0b09" };

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
const cell = "border-t border-white/10 px-3 py-2.5 align-top";
const head = "px-3 py-2 text-left font-ledger text-[10px] font-normal tracking-[0.18em] text-[#8f877b] uppercase";

// Everything listed here is what the code actually sets: the Supabase sign-in
// cookies (lib/supabase/server.ts, lib/supabase/proxy.ts; @supabase/ssr's
// default 400-day max-age), the install-card dismissal in localStorage
// (components/pwa/InstallPrompt.tsx, 30 days), and the service worker's
// cache (public/sw.js), and Vercel Web Analytics (components/analytics/
// SiteAnalytics.tsx — cookieless, scrubbed URLs). Update this page when any
// of that changes.
const sections: LegalSection[] = [
  {
    id: "short",
    title: "The short version",
    body: (
      <>
        <p>DoughTally uses only what it needs to work: a cookie that keeps you signed in, one small note in your browser, and — if you install the app — a cached copy of its files. We also count page visits with a cookie-free analytics tool, so we know which pages people use.</p>
        <p>There are no advertising cookies, no tracking across other websites and no social-media pixels. Nothing here is used to build a profile of you or sold to anyone.</p>
      </>
    ),
  },
  {
    id: "what",
    title: "What cookies are",
    body: (
      <p>A cookie is a small text file a website asks your browser to keep, and to send back on later visits. Similar technologies — like your browser&apos;s local storage and an installed app&apos;s cache — store small amounts of information on your device too. This policy covers all of them.</p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies we use",
    body: (
      <>
        <p>Both are <strong>strictly necessary</strong> and <strong>first-party</strong>: set by {SITE} itself, only for signing you in.</p>
        <div className="not-prose overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr>
                <th className={head}>Name</th>
                <th className={head}>What it does</th>
                <th className={head}>How long</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${cell} font-ledger text-[12px] text-white`}>sb-…-auth-token</td>
                <td className={cell}>Keeps you signed in, so each page knows it&apos;s you and shows only your business&apos;s data. It may be split into parts (ending .0, .1) when it&apos;s long.</td>
                <td className={cell}>Until you log out, or up to 400 days</td>
              </tr>
              <tr>
                <td className={`${cell} font-ledger text-[12px] text-white`}>sb-…-auth-token-code-verifier</td>
                <td className={cell}>A one-time security check while you follow a link from one of our emails (such as confirming your address), so the link only works in the browser that asked for it.</td>
                <td className={cell}>Minutes — removed once the link is used</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Our sign-in system is provided by Supabase, but these cookies belong to {SITE}; Supabase doesn&apos;t use them to track you anywhere else.</p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Other storage on your device",
    body: (
      <>
        <p><strong>Install-card note (local storage).</strong> If you dismiss the &ldquo;install the app&rdquo; card, your browser keeps a note named <span className="font-ledger text-[13px] text-white">doughtally-install-dismissed</span> with the time you did it, so the card stays away for 30 days.</p>
        <p><strong>App cache.</strong> If you install DoughTally to your home screen or desktop, your device keeps a copy of the app&apos;s own files (scripts, styles, icons) and a simple &ldquo;you&apos;re offline&rdquo; page, so it opens quickly. It never stores your invoices, recipes, prices or any other business data — those are always loaded fresh.</p>
      </>
    ),
  },
  {
    id: "analytics",
    title: "Visit counts (no cookies)",
    body: (
      <>
        <p>We use Vercel Web Analytics, from our hosting provider, to count page visits — for example, how many people opened the pricing section or the invoice import this week. It sets <strong>no cookies</strong> and stores nothing on your device, and it doesn&apos;t follow you to other websites.</p>
        <p>For each visit it records the kind of page (we strip anything after a &ldquo;?&rdquo; and replace record numbers, so it sees &ldquo;an invoice page&rdquo;, never which invoice), the referring site, and general device details such as browser, operating system and country. Visits can&apos;t be tied to your account, and a visitor can&apos;t be recognised from one day to the next.</p>
      </>
    ),
  },
  {
    id: "dont",
    title: "What we don't use",
    body: (
      <ul>
        <li>No cookie-based analytics or measurement tools (such as Google Analytics).</li>
        <li>No advertising or retargeting cookies, and no tracking pixels.</li>
        <li>No social-media buttons or embeds that set their own cookies.</li>
        <li>No fonts or scripts loaded from other companies&apos; servers on our pages — they&apos;re served from {SITE}.</li>
      </ul>
    ),
  },
  {
    id: "consent",
    title: "Why there's no cookie banner",
    body: (
      <p>Cookies that are strictly necessary for a service you&apos;ve asked for — like staying signed in — don&apos;t need a consent pop-up, and our visit counting sets no cookies at all. Since that&apos;s all we use, we don&apos;t show one. If we ever add anything that isn&apos;t strictly necessary, we&apos;ll update this page first and ask for your consent before setting it.</p>
    ),
  },
  {
    id: "control",
    title: "Controlling them",
    body: (
      <>
        <p>You can see, block or delete cookies and site data in your browser&apos;s settings (usually under Privacy or Site settings). Logging out removes the sign-in cookie.</p>
        <p>If you block cookies for {SITE}, you won&apos;t be able to log in — the sign-in cookie is how DoughTally knows it&apos;s you. Clearing site data also clears the install-card note and the app cache; uninstalling the app removes its cache too.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>If what we store changes, we&apos;ll update this page and the date at the top. For how we handle your information more generally, see our <Link href="/privacy">Privacy Policy</Link>.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions: {mail}. This policy covers {SITE} and the DoughTally app, operated by {COMPANY}.
      </p>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      kicker="Cookies"
      title="Cookie Policy"
      updated={COOKIES_UPDATED}
      intro={
        <p>
          This page lists every cookie and every piece of browser storage DoughTally uses, what each one is for, and how long it lasts. It&apos;s a short list.
        </p>
      }
      sections={sections}
    />
  );
}
