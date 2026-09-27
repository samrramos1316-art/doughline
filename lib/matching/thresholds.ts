// §5.2 step 5c confidence routing, on voyage-3.5 symmetric embeddings of the
// line's plain-English item_name vs. ingredient names:
//   top ≥ AUTO_MATCH_THRESHOLD → auto_matched
//   top ≥ REVIEW_THRESHOLD     → needs_review
//   otherwise                  → new_ingredient
// First real-data calibration (8 photographed Sysco lines vs. a bakery
// list): correct top matches 0.681–0.946, items not in the list topped out
// at 0.603–0.606. The spec's 0.75 review bar routes the correct eggs match
// (0.681) to new_ingredient; that's intended — it still shows as a
// suggestion (see below). Re-tune on real usage and move to an org-level
// setting (spec §5.2).
export const AUTO_MATCH_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.75;

// Display only — never changes match_status. Candidates below this aren't
// shown on the swipe card at all ("No match found"); the card offers
// create-new or a manual search instead. Between this and REVIEW_THRESHOLD
// a new_ingredient line still shows its closest ingredient as a
// low-confidence suggestion. 0.65 sits between the lowest correct match
// (eggs 0.681) and the highest not-in-list score (vanilla 0.606).
export const SUGGESTION_DISPLAY_THRESHOLD = 0.65;
