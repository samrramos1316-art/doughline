import type { DocumentType } from "@/lib/ai/vision/types";

type Kind = "invoice" | "menu" | "recipe";

const WHAT: Record<DocumentType, string> = {
  invoice: "a supplier invoice or receipt",
  menu: "a menu",
  recipe: "a recipe",
  other: "not an invoice, menu or recipe",
};

// The message when an upload turns out to be something other than what the
// box it was dropped in expects — shown by all three importers.
export function wrongKindMessage(expected: Kind, actual: DocumentType) {
  return actual === "other"
    ? "This doesn't look like an invoice, a receipt, a menu or a recipe — check it's the right file."
    : `This looks like ${WHAT[actual]}, not ${expected === "invoice" ? "an invoice" : `a ${expected}`}.`;
}

// 422 body the menu and recipe imports return; the screen re-reads a
// menu/recipe as the right kind and offers "Read it as an invoice".
export function wrongKindBody(expected: Kind, actual: DocumentType, fileStoragePath: string) {
  return { error: wrongKindMessage(expected, actual), wrong_kind: true, document_type: actual, file_storage_path: fileStoragePath };
}
