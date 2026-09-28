"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcknowledgeButton({ alertId, acknowledged }: { alertId: string; acknowledged: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch(`/api/alerts/${alertId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged: !acknowledged }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
        acknowledged ? "border border-stone-300 bg-white text-stone-700" : "bg-stone-900 text-white hover:bg-stone-800"
      }`}
    >
      {busy ? "Saving…" : acknowledged ? "Reopen" : "Mark as handled"}
    </button>
  );
}
