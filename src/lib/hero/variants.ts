// Hero A/B copy variants. Each is an emotional headline + a distinct
// supporting line. Adding, editing, or retiring a variant is a one-file
// change here: bump `weight` to favor a winner, set it to 0 to retire a
// loser. Purchase-attributed performance per variant shows in /admin.
//
// The `id` is stable and load-bearing: it's what impressions and
// conversions are keyed on in hero_variant_stats. Never reuse an old id for
// new copy or the stats will conflate them.

export interface HeroVariant {
  id: string;
  headline: string;
  subcopy: string;
  /** Relative assignment weight. Equal = even split. 0 = retired (never served). */
  weight: number;
}

export const HERO_VARIANTS: HeroVariant[] = [
  {
    id: "permanence-v2",
    headline: "A monument built one word at a time.",
    subcopy:
      "One dollar. One letter. Yours, forever. A million-cell wall engraved with what a million people had to say. Once a word is placed, it never comes down.",
    weight: 1,
  },
  {
    id: "unsaid-v2",
    headline: "Say it where it stays.",
    subcopy:
      "The name you don't say enough. The line that got you through. Place it letter by letter in a wall that never comes down. No feeds, no accounts, no deleting.",
    weight: 1,
  },
  {
    id: "oblivion-v2",
    headline: "Nothing you write here disappears.",
    subcopy:
      "The internet forgets everything. This doesn't. A dollar a letter buys a permanent place on a million-cell monument that will outlive every feed you've ever posted to.",
    weight: 1,
  },
  {
    id: "collective-v2",
    headline: "A million voices, carved in one place.",
    subcopy:
      "Add yours to a wall built one letter at a time by people who wanted to be remembered. A dollar a character, permanent. When the grid is full, it closes forever.",
    weight: 1,
  },
  {
    id: "scarcity-v1",
    headline: "One million cells. Once each. Ever.",
    subcopy:
      "Every cell on the monument sells exactly once, for one dollar. Pick your spot, spell it out, and it's yours for good. When they're gone, they're gone.",
    weight: 1,
  },
];

/** SSR/first-paint default. The client swaps in the session's assigned variant after mount. */
export const DEFAULT_HERO_VARIANT: HeroVariant = HERO_VARIANTS[0];

export function isKnownVariantId(id: string): boolean {
  return HERO_VARIANTS.some((v) => v.id === id);
}

export function getVariantById(id: string | null | undefined): HeroVariant {
  return HERO_VARIANTS.find((v) => v.id === id) ?? DEFAULT_HERO_VARIANT;
}

/** Weighted-random pick over non-retired variants. Client-side only (uses Math.random). */
export function pickWeightedVariant(): HeroVariant {
  const total = HERO_VARIANTS.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  if (total <= 0) return DEFAULT_HERO_VARIANT;
  let r = Math.random() * total;
  for (const v of HERO_VARIANTS) {
    r -= Math.max(0, v.weight);
    if (r <= 0) return v;
  }
  return DEFAULT_HERO_VARIANT;
}
