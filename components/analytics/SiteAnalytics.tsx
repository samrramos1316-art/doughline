"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Vercel Web Analytics: anonymous page-view counts, no cookies. Before a page
// view leaves the browser, the query string is dropped (import links carry
// storage paths, /login can carry an error) and record IDs become [id], so
// what Vercel sees is the kind of page — "/invoices/[id]" — never whose.
function scrub(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  return { ...event, url: `${url.origin}${url.pathname.replace(ID, "[id]")}` };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={scrub} />;
}
