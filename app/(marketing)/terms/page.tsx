import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { COMPANY, CONTACT_EMAIL, SITE } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service · DoughTally Software" };
export const viewport: Viewport = { themeColor: "#0c0b09" };

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>These terms are an agreement between you and {COMPANY} (&ldquo;DoughTally&rdquo;, &ldquo;we&rdquo;) for the use of {SITE} and the DoughTally app (the &ldquo;Service&rdquo;). By creating an account or using the Service you agree to them and to our <Link href="/privacy">Privacy Policy</Link>. If you&apos;re signing up for a business, you confirm you&apos;re allowed to accept these terms for it, and &ldquo;you&rdquo; means the business too.</p>
        <p>You must be at least 18, or the age of majority where you live, to use the Service.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "What DoughTally does",
    body: (
      <>
        <p>DoughTally reads supplier invoices, menus and recipes you upload; keeps ingredient costs; calculates recipe costs and menu margins; flags price changes; suggests options such as a new price or a smaller portion; and shows public market price data for context.</p>
        <p>We&apos;re improving it all the time, so features may change. If we remove something important, we&apos;ll try to give you notice.</p>
      </>
    ),
  },
  {
    id: "numbers",
    title: "Checking the numbers is your call",
    body: (
      <>
        <p>DoughTally uses automated reading and AI models to interpret documents, match ingredients and convert amounts. They are good but not perfect: a photo can be misread, a match can be wrong, and a conversion (for example, cups of flour to pounds) is an estimate.</p>
        <ul>
          <li>Review what the Service reads and suggests, especially anything it marks as uncertain, before relying on it.</li>
          <li>Suggestions are arithmetic on the data you&apos;ve confirmed. They are information, <strong>not financial, accounting, tax or legal advice</strong>. Pricing, portion and purchasing decisions are yours.</li>
          <li>Market data comes from public sources, is shown as general context, and is not a forecast of what your suppliers will charge.</li>
        </ul>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <>
        <p>Give us accurate sign-up details and keep your password to yourself. You&apos;re responsible for what happens under your account. Tell us at {mail} straight away if you think someone else has got into it.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your data stays yours",
    body: (
      <>
        <p>You own the documents and information you put into DoughTally (&ldquo;your content&rdquo;). You give us permission to store, copy, process and display your content only as needed to run the Service for you, including sending it to the service providers named in our <Link href="/privacy">Privacy Policy</Link>. We don&apos;t sell it or use it to advertise.</p>
        <p>You confirm you have the right to upload your content. Don&apos;t upload documents that contain other people&apos;s personal information you aren&apos;t allowed to share, or payment card numbers.</p>
        <p>You can export your ingredient list and costs at any time, and you can ask us to delete your account and data.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "Fair use",
    body: (
      <>
        <p>Please don&apos;t:</p>
        <ul>
          <li>break the law, or use the Service to infringe anyone&apos;s rights;</li>
          <li>try to access other businesses&apos; data, probe or break our security, or overload the Service;</li>
          <li>reverse-engineer the Service, scrape it, or resell it without our written agreement;</li>
          <li>upload malware or anything designed to cause harm.</li>
        </ul>
        <p>We may suspend accounts that do these things. Where it&apos;s reasonable, we&apos;ll warn you first.</p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <p>The Service is currently free to use. If we introduce paid plans, we&apos;ll tell you before any charge applies and you won&apos;t be charged unless you choose a paid plan.</p>
    ),
  },
  {
    id: "ours",
    title: "Our property",
    body: (
      <p>The Service itself (the software, design, text and the DoughTally name and logo) belongs to {COMPANY}. These terms give you the right to use it, not ownership of it. If you send us feedback, we may use it without owing you anything.</p>
    ),
  },
  {
    id: "ending",
    title: "Ending",
    body: (
      <>
        <p>You can stop using DoughTally whenever you like, and ask us to delete your account at {mail}.</p>
        <p>We may suspend or end your access if you seriously or repeatedly break these terms, or if we have to for legal reasons. If we stop offering the Service altogether, we&apos;ll give you reasonable notice and a chance to export your data.</p>
      </>
    ),
  },
  {
    id: "warranty",
    title: "Disclaimers",
    body: (
      <p>
        We work hard to keep DoughTally accurate and available, but the Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>. To the fullest extent the law allows, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, accuracy and non-infringement, and we don&apos;t promise it will be uninterrupted or error-free.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on liability",
    body: (
      <>
        <p>To the fullest extent the law allows, {COMPANY} won&apos;t be liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, margin or data, arising from your use of the Service, including decisions made using its figures or suggestions.</p>
        <p>Our total liability for any claim relating to the Service is limited to the greater of the amount you paid us in the 12 months before the claim, or US$100.</p>
        <p>Some places don&apos;t allow these limits, so they may not all apply to you.</p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>If someone brings a claim against us because of content you uploaded or your breach of these terms, you agree to cover our reasonable costs and losses from that claim.</p>
    ),
  },
  {
    id: "changes",
    title: "Changes and the legal bits",
    body: (
      <>
        <p>We may update these terms. If a change matters, we&apos;ll update the date above and let signed-up users know by email or in the app before it takes effect. Using the Service after that means you accept the new terms.</p>
        <p>These terms are governed by the laws of the United States and of the state where {COMPANY} is established, without regard to conflict-of-law rules. If a part of them is found unenforceable, the rest still applies. Not enforcing a part isn&apos;t a waiver of it. These terms and the Privacy Policy are the whole agreement between us about the Service.</p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Questions about these terms: {mail}.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      kicker="Terms"
      title="Terms of Service"
      intro={<p>The short version: your data is yours, check the numbers before you act on them, and play fair. The full terms are below.</p>}
      sections={sections}
    />
  );
}
