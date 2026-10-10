"use client";

import { browserLocalDate } from "@/lib/dates/localDate";

// Today's date where the reader is (the server only knows UTC, which in the
// US evening is already tomorrow — lib/dates/localDate.ts).
export function Today() {
  return <time suppressHydrationWarning>{browserLocalDate()}</time>;
}
