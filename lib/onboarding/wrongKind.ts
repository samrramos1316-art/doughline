import type { DocumentType } from "@/lib/ai/vision/types";
import { lower, menuDoc, vocabFor, withArticle, type Vocab } from "../vocab.ts";

type Kind = "invoice" | "menu" | "recipe";

// "a menu" / "a recipe" in the industry's words (lib/industries).
const what = (kind: DocumentType, v: Vocab) =>
  kind === "invoice" ? "a supplier invoice or receipt" : kind === "menu" ? withArticle(menuDoc(v)) : withArticle(lower(v.recipe));

// The message when an upload turns out to be something other than what the
// box it was dropped in expects — shown by all three importers. `v`: the
// business's words; left out, the food wording.
export function wrongKindMessage(expected: Kind, actual: DocumentType, v: Vocab = vocabFor(null)) {
  return actual === "other"
    ? `This doesn't look like an invoice, a receipt, ${what("menu", v)} or ${what("recipe", v)} — check it's the right file.`
    : `This looks like ${what(actual, v)}, not ${expected === "invoice" ? "an invoice" : what(expected, v)}.`;
}

// 422 body the menu and recipe imports return; the screen re-reads a
// menu/recipe as the right kind and offers "Read it as an invoice".
export function wrongKindBody(expected: Kind, actual: DocumentType, fileStoragePath: string, v?: Vocab) {
  return { error: wrongKindMessage(expected, actual, v), wrong_kind: true, document_type: actual, file_storage_path: fileStoragePath };
}
