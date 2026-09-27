// §3.5 / §5.2 step 5a: the key vendor_ingredient_aliases is looked up by.
// Lowercase, trim, collapse internal whitespace — so "AP FLOUR  BLCHD 50# BG"
// and "ap flour blchd 50# bg" are the same vendor phrasing.
export function normalizeRawText(rawText: string): string {
  return rawText.toLowerCase().replace(/\s+/g, " ").trim();
}
