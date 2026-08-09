/**
 * Puzzle-solving rating: a second, independent kyu number from the in-game
 * rank (rank.js). Winning a game and solving a puzzle measure different
 * things — a strong reader can play carelessly, a careful player can be slow
 * to read — so they're tracked and persisted separately, but on the same
 * kyu scale (reusing MIN_KYU/MAX_KYU/formatRank from rank.js) so the two
 * numbers stay directly comparable.
 *
 * Same Elo-style shape as updateRatingAfterGame: expected score from the kyu
 * gap, a tapering K-factor so early attempts move the rating fast and it
 * settles down over time, and a hard per-attempt cap so no single puzzle can
 * swing it wildly.
 */
import { MIN_KYU, MAX_KYU, formatRank } from './rank'

const STORAGE_KEY = 'go-teacher.puzzleRank'

// A puzzle rating starts here until the player has solved (or missed)
// enough to move it — roughly "knows the rules," the same prior rank.js
// uses for the equivalent self-reported experience level.
export const DEFAULT_PUZZLE_KYU = 20

export { formatRank }

function expectedScore(playerKyu, puzzleKyu) {
  const gap = puzzleKyu - playerKyu // positive = puzzle is easier than the player
  return 1 / (1 + 10 ** (-gap / 4))
}

/**
 * Move the puzzle rating after one first attempt at a puzzle.
 *
 * @param puzzleRank    the persisted object, `{ kyu, attempts }`
 * @param solved         whether the first attempt got it right
 * @param puzzleDifficulty the puzzle's own kyu rating (puzzles.js `difficulty`)
 */
export function updatePuzzleRating({ kyu, attempts = 0 }, { solved, puzzleDifficulty }) {
  const expected = expectedScore(kyu, puzzleDifficulty)
  const actual = solved ? 1 : 0
  const k = Math.max(0.4, 2 / Math.sqrt(attempts + 1))
  const rawDelta = k * (actual - expected)
  const delta = Math.min(2, Math.max(-2, rawDelta))
  const nextKyu = Math.min(MAX_KYU, Math.max(MIN_KYU, kyu - delta))
  return { kyu: nextKyu, delta: kyu - nextKyu, attempts: attempts + 1 }
}

/**
 * Choose the next round: puzzles closest to the player's current puzzle
 * rating, so the set adapts as the rating moves, with a wider randomized
 * band so the same rating doesn't always hand back the identical five.
 * `excludeIds` lets the caller avoid repeating puzzles already seen this
 * session before the bank has to start recycling them.
 */
export function pickRound(puzzles, kyu, roundSize = 5, excludeIds = []) {
  const fresh = puzzles.filter((p) => !excludeIds.includes(p.id))
  const source = fresh.length >= roundSize ? fresh : puzzles
  const ranked = [...source].sort(
    (a, b) => Math.abs(a.difficulty - kyu) - Math.abs(b.difficulty - kyu),
  )
  const band = ranked.slice(0, Math.min(ranked.length, roundSize * 2))
  const shuffled = [...band].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, roundSize)
}

export function loadPuzzleRank() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.kyu === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function savePuzzleRank(puzzleRank) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(puzzleRank))
  } catch {
    // Private browsing or a full quota — the app still works, just forgetfully.
  }
}
