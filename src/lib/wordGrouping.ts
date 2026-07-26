import type { Cell } from '@/lib/types'

export interface WordGroup {
  y: number
  startX: number
  text: string
  cellIds: number[]
}

/**
 * Groups purchased cells into "words" - runs of consecutive x positions on the
 * same row that carry a character. Used anywhere a raw list of cells needs to
 * read as the message the buyer actually typed (checkout summary, receipts,
 * share images, highlights).
 */
export function groupCellsIntoWords(cells: Cell[]): WordGroup[] {
  const lettered = cells
    .filter((cell) => cell.character !== null)
    .slice()
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))

  const groups: WordGroup[] = []

  for (const cell of lettered) {
    const last = groups[groups.length - 1]
    const continuesRun = last && cell.y === last.y && cell.x === last.startX + last.text.length
    if (continuesRun) {
      last.text += cell.character
      last.cellIds.push(cell.id)
      continue
    }
    groups.push({ y: cell.y, startX: cell.x, text: cell.character ?? '', cellIds: [cell.id] })
  }

  return groups
}

/** Assembles a display-ready message from word groups, one row per line. */
export function assembleMessage(groups: WordGroup[]): string {
  const rows = new Map<number, string[]>()
  for (const group of groups) {
    const row = rows.get(group.y) ?? []
    row.push(group.text)
    rows.set(group.y, row)
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, words]) => words.join(' '))
    .join('\n')
}

/** Total non-space characters across a set of word groups. */
export function letterCount(groups: WordGroup[]): number {
  return groups.reduce((total, group) => total + group.text.length, 0)
}
