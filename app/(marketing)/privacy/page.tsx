import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, CONTACT_EMAIL, SITE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · DoughTally Software" };
export const viewport: Viewport = { themeColor: "#0c0b09" };

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p><strong>Account details.</strong> Your email address, a password (stored only as a salted hash by our authentication provider), your business name and type, and your name if you give it.</p>
        <p><strong>What you put into the app.</strong> Photos and PDFs of supplier invoices, menus and recipes; the details read from them (vendors, invoice numbers and dates, line items, quantities, prices); your ingredient list and costs; recipes, menu items and selling prices; your settings, such as target margin and alert threshold; and the decisions you make while reviewing, such as confirming that a supplier&apos;s wording means a particular ingredient.</p>
        <p><strong>Technical data.</strong> When you use the site, our hosting and database providers record standard request logs (IP address, browser type, pages requested, time, errors). We use these to keep the service running and secure.</p>
        <p>We don&apos;t ask for payment card details, and we don&apos;t collect information about your customers.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <p>Only to run DoughTally for you:</p>
        <ul>
          <li>to read your documents and turn them into costs, recipes and menu items;</li>
          <li>to match invoice lines to your ingredients, and remember how each supplier words things so it can match them automatically next time;</li>
          <li>to calculate costs and margins, raise price alerts and suggest options;</li>
          <li>to sign you in, keep your account secure, and send the emails the service needs (such as confirming your address or resetting a password);</li>
          <li>to find and fix problems, and to answer you when you contact us.</li>
        </ul>
        <p><strong>We don&apos;t sell your data, share it with advertisers, or use it to advertise to you.</strong> We don&apos;t combine your business&apos;s numbers with anyone else&apos;s, and we don&apos;t show them to other users.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "Automated reading and AI",
    body: (
      <>
        <p>To read your documents, DoughTally sends them to AI models run by our service providers:</p>
        <ul>
          <li><strong>Anthropic (Claude)</strong> receives the images and PDFs you upload, and the text read from them, to extract line items, menu items and recipes, and to write the short plain-English summaries on price alerts.</li>
          <li><strong>Voyage AI</strong> receives ingredient names and invoice item descriptions (text only, not your documents) to produce the numerical representations used for matching.</li>
        </ul>
        <p>Both process this data to provide their service to us under their commercial API terms, which do not permit them to train their models on it. Nothing that AI reads changes your costs on its own when it isn&apos;t sure: uncertain matches wait for you to confirm, and you can correct anything.</p>
      </>
    ),
  },
  {
    id: "share",
    title: "Who else handles your data",
    body: (
      <>
        <p>We use a small number of providers to run the service. Each only gets what it needs to do its job:</p>
        <ul>
          <li><strong>Supabase</strong>: database, sign-in, and storage for your uploaded files.</li>
          <li><strong>Vercel</strong>: hosting of the website and app.</li>
          <li><strong>Anthropic</strong> and <strong>Voyage AI</strong>: as described above.</li>
          <li>An email delivery provider, for account emails.</li>
        </ul>
        <p>Market prices come from public sources (the USDA Agricultural Marketing Service and the UN Food and Agriculture Organization). We only download from them; none of your information is sent to them.</p>
        <p>We may disclose information if the law requires it, to protect the rights and safety of our users or the service, or as part of a sale or merger of the business, in which case this policy would continue to apply to your data.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <>
        <p>We use only the cookies needed to keep you signed in. There are no advertising or cross-site tracking cookies, and no third-party analytics.</p>
        <p>The app also stores a small note in your browser if you dismiss the &ldquo;install the app&rdquo; card, so it stops asking. If you install DoughTally to your home screen, your device keeps a copy of the offline page and app files; it never stores your business data offline.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>Your data is encrypted in transit (HTTPS) and at rest with our providers. Every row in the database belongs to one business, and the database itself refuses to show it to anyone outside that business. Uploaded files are kept in private storage that only your account can read. Server-side secrets are never sent to your browser.</p>
        <p>No system is perfectly secure. If we learn of a breach that affects your data, we&apos;ll tell you without undue delay.</p>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it, and your choices",
    body: (
      <>
        <p>We keep your data for as long as you have an account. You can edit or delete individual ingredients, recipes, menu items and invoice lines at any time, and export your ingredient list and costs as a CSV whenever you like.</p>
        <p>To close your account and delete your data, email {mail} from the address on the account. We&apos;ll delete it from the live service within 30 days; copies in backups age out on our providers&apos; normal schedules. You can also ask us for a copy of your data, or to correct it.</p>
        <p>Depending on where you live, you may have further rights under laws such as the GDPR or the California Consumer Privacy Act, including the right to know, access, correct or delete personal information and to not be discriminated against for using them. Email us and we&apos;ll respond within the time the law requires.</p>
      </>
    ),
  },
  {
    id: "other",
    title: "Children, international use and changes",
    body: (
      <>
        <p>DoughTally is a business tool for adults. It isn&apos;t directed at children, and we don&apos;t knowingly collect information from anyone under 16.</p>
        <p>Our providers may store and process data in the United States and other countries. Where the law requires it, transfers are covered by the providers&apos; standard contractual protections.</p>
        <p>If we change this policy in a way that matters, we&apos;ll update the date above and tell signed-up users by email or in the app before the change takes effect.</p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions or requests: {mail}. This policy covers {SITE} and the DoughTally app, operated by {COMPANY}. See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      kicker="Privacy"
      title="Privacy Policy"
      intro={
        <p>
          DoughTally Software (&ldquo;DoughTally&rdquo;, &ldquo;we&rdquo;) helps small food businesses track ingredient costs and menu margins. That means you trust us with your invoices and your numbers. This page explains, plainly, what we collect, what we do with it, and who else touches it.
        </p>
      }
      sections={sections}
    />
  );
}
