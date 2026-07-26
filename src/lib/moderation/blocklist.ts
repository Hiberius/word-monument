/**
 * Deterministic, synchronous blocklist check used as a fast pre-reservation
 * gate (before the async OpenAI moderation call, which only runs post
 * purchase). Not exhaustive by design - it exists to reject the obvious
 * cases immediately; the OpenAI moderation pass in `openai.ts` is the
 * real backstop.
 */

interface CellCharacter {
  x: number;
  y: number;
  character: string;
}

/**
 * Sorts cells into grid reading order (top row first, left to right within
 * a row) - NOT the order the visitor selected/typed them in - then joins
 * their characters into the message that will actually be moderated and
 * displayed.
 */
export function assembleMessage(cells: CellCharacter[]): string {
  return [...cells]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((cell) => cell.character)
    .join('');
}

/**
 * Splits cells into the contiguous horizontal runs a visitor actually reads:
 * a new run begins at every row change and at every gap in x. Blocklist checks
 * must run per run, because joining a whole selection into one string fuses
 * words that are rows apart or separated by cells nobody bought into terms
 * nobody ever wrote - and a false positive here 422s a paying buyer.
 */
export function assembleRuns(cells: CellCharacter[]): string[] {
  const runs: string[] = [];
  let current = '';
  let previous: CellCharacter | undefined;

  for (const cell of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (previous && (cell.y !== previous.y || cell.x !== previous.x + 1)) {
      runs.push(current);
      current = '';
    }
    current += cell.character;
    previous = cell;
  }

  if (current.length > 0) {
    runs.push(current);
  }

  return runs;
}

// Deliberately small starter list of obvious hate/slur/spam terms, meant to
// be extended later (ideally swapped for a maintained external word list
// before this product scales). Matching is exact-substring on normalized,
// lowercased, whitespace-collapsed text, and on a separator-stripped form of
// it so the multi-word entries below are reachable at all.
const BLOCKED_TERMS: string[] = [
  // Hate speech / slurs
  'nigger',
  'nigga',
  'faggot',
  'chink',
  'spic',
  'kike',
  'retard',
  'tranny',
  'kill yourself',
  'kys',
  // Spam / scam
  'buy followers',
  'free bitcoin',
  'click here to win',
  'crypto giveaway',
  'onlyfans link in bio',
  'viagra',
];

function normalizeForCheck(message: string): string {
  return message.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Grid text is assembled straight from the cells, with no spaces between
// words, so a multi-word term can only ever match once the separators are
// stripped from both the message and the term.
//
// Everything that is not a letter or a digit counts as a separator, rather
// than a hand-listed set. ALLOWED_PUNCTUATION (see moderation/charset.ts) lets
// a buyer place @ # ! ? & + / : ; ( ) and quotes into cells, so any fixed list
// leaves a trivial bypass: "kill@yourself" reads perfectly on the grid but
// slips past a list that only knows about spaces, dashes and dots. Deriving
// the class instead of listing it keeps this correct if the allowed punctuation
// ever changes.
function stripSeparators(value: string): string {
  return value.replace(/[^\p{L}\p{N}]/gu, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Builds a per-term regex tolerant of basic obfuscation: letters separated
// by a small number of spaces/punctuation characters, e.g. "n-i-g-g-e-r"
// or "n i g g e r".
function buildObfuscationPattern(term: string): RegExp {
  const spaced = term
    .split('')
    .map((char) => escapeRegExp(char))
    .join('[\\s\\-_.,*]{0,2}');
  return new RegExp(spaced, 'i');
}

export function checkBlocklist(message: string): { blocked: boolean; matchedTerm?: string } {
  const normalized = normalizeForCheck(message);

  if (normalized.length === 0) {
    return { blocked: false };
  }

  const compact = stripSeparators(normalized);

  for (const term of BLOCKED_TERMS) {
    if (normalized.includes(term) || compact.includes(stripSeparators(term))) {
      return { blocked: true, matchedTerm: term };
    }
  }

  for (const term of BLOCKED_TERMS) {
    if (buildObfuscationPattern(term).test(normalized)) {
      return { blocked: true, matchedTerm: term };
    }
  }

  return { blocked: false };
}
