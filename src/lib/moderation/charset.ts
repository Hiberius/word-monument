/**
 * Character allow-list for monument cells.
 *
 * SAFE TO IMPORT FROM CLIENT COMPONENTS: no server-only APIs, no Node
 * built-ins, no `next/server` imports - pure constants and functions only.
 * The grid-engine and pages agents import this directly for live
 * keystroke-level validation as a visitor types a character.
 *
 * Deliberately NOT using generic Unicode grapheme segmentation
 * (`Intl.Segmenter`, `[...str]`, etc.) - that is exploitable via ZWJ
 * sequences, variation selectors, and combining marks that can smuggle in
 * multi-codepoint payloads disguised as "one visible character". Every
 * allowed character is instead an exact string match against a small,
 * explicit, curated set.
 */

export const ALLOWED_PUNCTUATION: string[] = [
  '.', // period
  ',', // comma
  '!', // exclamation mark
  '?', // question mark
  "'", // apostrophe
  '"', // double quote
  '-', // hyphen
  '@', // at sign
  '#', // hash
  '&', // ampersand
  '*', // asterisk
  '+', // plus
  '/', // slash
  ':', // colon
  ';', // semicolon
  '(', // open paren
  ')', // close paren
];

export const CURATED_EMOJI: string[] = [
  '❤️',
  '😊',
  '😂',
  '🎉',
  '👍',
  '🙏',
  '⭐',
  '🔥',
  '💯',
  '😍',
  '✨',
  '💪',
  '🥰',
  '😎',
];

const ALPHANUMERIC_PATTERN = /^[A-Za-z0-9]$/;

/**
 * True iff `input` is EXACTLY one of: a single A-Z/a-z/0-9 character, one
 * entry of ALLOWED_PUNCTUATION, or an exact string match against one entry
 * of CURATED_EMOJI. No partial matches, no normalization, no trimming -
 * the caller is expected to pass a single logical "cell character" as-is.
 */
export function validateCharacter(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) {
    return false;
  }

  if (input.length === 1 && ALPHANUMERIC_PATTERN.test(input)) {
    return true;
  }

  if (ALLOWED_PUNCTUATION.includes(input)) {
    return true;
  }

  if (CURATED_EMOJI.includes(input)) {
    return true;
  }

  return false;
}
