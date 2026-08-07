/**
 * Player strength, and how it becomes a handicap.
 *
 * Go ranks run from about 30 kyu (a complete beginner) up to 1 kyu, then into
 * dan grades. Lower kyu is stronger. The traditional rule is that a difference
 * of N ranks is worth N handicap stones, which is exactly how we turn an
 * estimated rank into a game setup — the player never has to think in stones.
 *
 * GNU Go plays somewhere around 8 kyu. That figure is approximate and varies
 * by board size, so treat the resulting handicap as a starting guess that
 * match results should refine (Phase 4).
 */

const STORAGE_KEY = 'go-teacher.rank'

export const MIN_KYU = -9 // roughly 9 dan
export const MAX_KYU = 30 // roughly a complete beginner

/** Plain-language self-assessment. `kyu` is the estimate we record. */
export const EXPERIENCE_OPTIONS = [
  { id: 'never', label: 'I have never played', blurb: 'Start from the very beginning.', kyu: 25 },
  { id: 'rules', label: 'I know the rules', blurb: 'You understand capturing and territory.', kyu: 20 },
  { id: 'some', label: 'I have played a few games', blurb: 'You have finished real games.', kyu: 15 },
  { id: 'regular', label: 'I play regularly', blurb: 'You know shape and can read ahead.', kyu: 12 },
  { id: 'strong', label: 'I am a strong player', blurb: 'Single-digit kyu or better.', kyu: 8 },
]

/** Convert a number of correct assessment puzzles into a rank estimate. */
export function kyuFromScore(correct, total) {
  if (total === 0) return 25
  const ladder = [25, 22, 18, 15, 11, 8]
  const index = Math.round((correct / total) * (ladder.length - 1))
  return ladder[Math.min(ladder.length - 1, Math.max(0, index))]
}

/**
 * Which opponent to face. Levels 1-5 differ in how often the engine
 * deliberately plays an inferior move — no handicap stones are involved, so
 * every game starts from an empty board.
 */
export const AI_LEVELS = {
  1: { name: 'Gentle', blurb: 'Misses a lot. A fair first opponent.' },
  2: { name: 'Careless', blurb: 'Plays reasonably but drops things.' },
  3: { name: 'Steady', blurb: 'Occasional slips.' },
  4: { name: 'Sharp', blurb: 'Rarely makes a mistake.' },
  5: { name: 'Full strength', blurb: 'No deliberate errors at all.' },
}

/**
 * Which name best describes a given kyu. Purely a display label now — the
 * server drives actual engine difficulty continuously from the raw kyu (see
 * difficultyForKyu in server/games.js) — but the five buckets are still a
 * handy way to put a word on an opponent's strength.
 */
export function aiLevelForKyu(kyu) {
  if (kyu >= 20) return 1
  if (kyu >= 16) return 2
  if (kyu >= 12) return 3
  if (kyu >= 9) return 4
  return 5
}

/**
 * Expected win probability from the kyu gap between two players, in the
 * spirit of an Elo expected-score curve but expressed on the kyu axis this
 * app already uses. SCALE (4) sets how many kyu of gap is worth being
 * strongly favored — chosen to roughly track the handicap-stone convention
 * documented above (a few kyu apart is a real edge, not a coin flip).
 */
function expectedScore(playerKyu, opponentKyu) {
  const gap = opponentKyu - playerKyu // positive = opponent is weaker
  return 1 / (1 + 10 ** (-gap / 4))
}

/**
 * Move the player's live rating after a finished game. Winning against a
 * stronger (lower-kyu) opponent moves the rating more than winning against a
 * weaker one, and vice versa for losses — standard Elo-style behaviour,
 * just anchored to kyu instead of a points scale.
 *
 * Two dampeners keep any single game from swinging the rating hard:
 * - `k` is deliberately small and tapers further as more games are played
 *   (provisional ratings move faster, like most rating systems), so an even
 *   matchup moves the rating well under a point.
 * - the result is scaled by how well the game was actually *played* (see
 *   `averageLoss`, the same per-move review data shown after the game) — a
 *   scrappy win earns less, a close well-played loss costs less.
 * A hard cap on top means no combination of the above can ever produce a
 * wild single-game swing.
 *
 * @param rank         the persisted rank object, `{ kyu, gamesPlayed }`
 * @param won           whether the human won this game
 * @param opponentKyu   the AI's actual target strength for this game
 *                       (not necessarily the player's own rating — see the
 *                       manual strength picker in PlayAI.jsx)
 * @param averageLoss   average points lost per move this game, from
 *                       reviewGame()'s `performance.averageLoss` — omit (or
 *                       pass null) if the review couldn't be fetched, which
 *                       falls back to a neutral 1x multiplier rather than
 *                       assuming the best case
 */
export function updateRatingAfterGame({ kyu, gamesPlayed = 0 }, { won, opponentKyu, averageLoss = null }) {
  const expected = expectedScore(kyu, opponentKyu)
  const actual = won ? 1 : 0
  const k = Math.max(0.3, 1.2 / Math.sqrt(gamesPlayed + 1))
  // 0 average loss -> 1.3x; ~3 (a "solid" game) -> ~1x; 8+ ("rough") -> 0.5x
  // floor. Unknown (review unavailable) -> neutral, rather than assuming the
  // best case just because no data came back.
  const performanceMultiplier =
    averageLoss == null ? 1 : Math.min(1.3, Math.max(0.5, 1.3 - averageLoss * 0.1))
  const rawDelta = k * (actual - expected) * performanceMultiplier
  const delta = Math.min(3, Math.max(-3, rawDelta))
  const nextKyu = Math.min(MAX_KYU, Math.max(MIN_KYU, kyu - delta))
  return { kyu: nextKyu, delta: kyu - nextKyu, gamesPlayed: gamesPlayed + 1 }
}

export function formatRank(kyu) {
  return kyu >= 1 ? `${Math.round(kyu)} kyu` : `${Math.abs(Math.round(kyu)) + 1} dan`
}

/** Persisted locally for now; Phase 4 moves this to the server with SQLite. */
export function loadRank() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.kyu === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function saveRank(rank) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rank))
  } catch {
    // Private browsing or a full quota — the app still works, just forgetfully.
  }
}

export function clearRank() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do */
  }
}
