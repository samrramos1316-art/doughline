"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// For an upload with nothing on it (a blank page, a duplicate, the wrong
// file): remove it so it stops showing as "Couldn't read". The API only
// allows this for invoices with no lines, so no applied price is undone.
export function DeleteInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Delete this upload? It has no line items, so nothing else changes.")) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    if (!res.ok) {
      setPending(false);
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete it");
      return;
    }
    router.push("/invoices");
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
