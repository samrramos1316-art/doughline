"use client";

import { createContext, useContext } from "react";
import { vocabFor, type Vocab } from "@/lib/vocab";

// The org's display words (lib/industries) for client components, set once
// by the app layout. Outside a provider: the food wording.
const VocabContext = createContext<Vocab>(vocabFor(null));

export function VocabProvider({ vocab, children }: { vocab: Vocab; children: React.ReactNode }) {
  return <VocabContext.Provider value={vocab}>{children}</VocabContext.Provider>;
}

export function useVocab(): Vocab {
  return useContext(VocabContext);
}
