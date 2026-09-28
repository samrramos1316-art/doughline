"use client";

import { useEffect, useState } from "react";

// The Claude narrative is generated once per alert and cached server-side;
// fetched after the page renders so the deterministic numbers never wait on
// an AI call (and still show if it fails).
export function NarrativePanel({ alertId, initialNarrative }: { alertId: string; initialNarrative: string | null }) {
  const [narrative, setNarrative] = useState(initialNarrative);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initialNarrative) return;
    let cancelled = false;
    fetch(`/api/alerts/${alertId}/narrative`, { method: "POST" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body.narrative) setNarrative(body.narrative);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [alertId, initialNarrative]);

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <p className="border-b border-stone-200 bg-stone-50/80 px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-stone-600 uppercase">✦ AI summary</p>
      <div className="px-3 py-3">
      {narrative ? (
        <p data-testid="ai-narrative" className="text-[13px] leading-relaxed text-stone-800">
          {narrative}
        </p>
      ) : failed ? (
        <p className="text-sm text-stone-500">Couldn&apos;t write a summary right now — the suggestions above still stand.</p>
      ) : (
        <p className="text-sm text-stone-500">Writing a summary…</p>
      )}
      </div>
    </div>
  );
}
