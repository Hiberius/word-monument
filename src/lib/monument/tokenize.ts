import { CURATED_EMOJI, validateCharacter } from '@/lib/moderation/charset'

export interface MessageToken {
  /** The literal unit rendered/priced - usually one code point, but a whole
   * curated emoji (which may span more than one UTF-16 code unit) is kept
   * intact so it prices and validates as the single cell it would occupy. */
  char: string
  isSpace: boolean
  isValid: boolean
}

/**
 * Splits a typed message into the units the grid would actually charge for and
 * place. Every unit is either a space, an exact curated-emoji match, or a single
 * Unicode code point checked against `validateCharacter` - deliberately NOT
 * generic grapheme segmentation (which is exploitable). Shared by the homepage
 * calculator (pricing preview) and the "place it on the grid" seeding, so both
 * agree on exactly what one cell holds. The reservation API stays the source of
 * truth for what is actually accepted.
 */
export function tokenizeMessage(message: string): MessageToken[] {
  const tokens: MessageToken[] = []
  let i = 0

  while (i < message.length) {
    const char = message[i]

    if (char === ' ') {
      tokens.push({ char, isSpace: true, isValid: true })
      i += 1
      continue
    }

    const emojiMatch = CURATED_EMOJI.find((emoji) => message.startsWith(emoji, i))
    if (emojiMatch) {
      tokens.push({ char: emojiMatch, isSpace: false, isValid: true })
      i += emojiMatch.length
      continue
    }

    const codePoint = message.codePointAt(i)
    const unit = codePoint !== undefined ? String.fromCodePoint(codePoint) : char
    tokens.push({ char: unit, isSpace: false, isValid: validateCharacter(unit) })
    i += unit.length
  }

  return tokens
}
