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
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-blue-700 uppercase">AI summary</p>
      {narrative ? (
        <p data-testid="ai-narrative" className="text-sm leading-relaxed text-blue-950">
          {narrative}
        </p>
      ) : failed ? (
        <p className="text-sm text-blue-900/70">Couldn&apos;t write a summary right now — the suggestions above still stand.</p>
      ) : (
        <p className="text-sm text-blue-900/70">Writing a summary…</p>
      )}
    </div>
  );
}
