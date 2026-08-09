import { randomUUID } from 'node:crypto'
import { GtpEngine } from './gtp.js'

/**
 * In-memory game registry. Each game owns a long-lived GNU Go process, so the
 * engine keeps its own board state and we only replay moves into it once.
 *
 * Phase 4 will persist results to SQLite; this store is deliberately volatile.
 */

const games = new Map()
const IDLE_TIMEOUT_MS = 30 * 60 * 1000
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

export const MIN_KYU = -9 // roughly 9 dan
export const MAX_KYU = 30 // roughly a complete beginner

/**
 * GNU Go's own --level tunes reading depth, not playing strength: on 9x9,
 * level 1 beats level 10 about as often as it loses. So difficulty is built
 * here instead, by having the engine deliberately choose an inferior move some
 * of the time.
 *
 * `mistakeChance` is how often it declines to play its best move;
 * `mistakeDepth` is how far down its own candidate list it will stray. Because
 * the alternatives all come from GNU Go's ranked candidates, a "mistake" is a
 * plausible-looking but weaker move rather than a random point on the board —
 * which is what makes it feel like a weaker opponent instead of a broken one.
 *
 * These five anchors are exactly the values the old discrete 1-5 levels used.
 * difficultyForKyu() linearly interpolates between them so strength scales
 * smoothly with any requested kyu instead of jumping between five buckets.
 */
const DIFFICULTY_ANCHORS = [
  { kyu: 5, mistakeChance: 0, mistakeDepth: 1 },
  { kyu: 10, mistakeChance: 0.2, mistakeDepth: 4 },
  { kyu: 13, mistakeChance: 0.4, mistakeDepth: 6 },
  { kyu: 18, mistakeChance: 0.6, mistakeDepth: 8 },
  { kyu: 25, mistakeChance: 0.85, mistakeDepth: 10 },
]

export function difficultyForKyu(kyu) {
  const target = Math.min(MAX_KYU, Math.max(MIN_KYU, Number(kyu)))
  const first = DIFFICULTY_ANCHORS[0]
  const last = DIFFICULTY_ANCHORS[DIFFICULTY_ANCHORS.length - 1]

  if (target <= first.kyu) return { mistakeChance: first.mistakeChance, mistakeDepth: first.mistakeDepth }
  if (target >= last.kyu) return { mistakeChance: last.mistakeChance, mistakeDepth: last.mistakeDepth }

  for (let i = 0; i < DIFFICULTY_ANCHORS.length - 1; i += 1) {
    const lo = DIFFICULTY_ANCHORS[i]
    const hi = DIFFICULTY_ANCHORS[i + 1]
    if (target < lo.kyu || target > hi.kyu) continue
    const t = (target - lo.kyu) / (hi.kyu - lo.kyu)
    return {
      mistakeChance: lo.mistakeChance + t * (hi.mistakeChance - lo.mistakeChance),
      mistakeDepth: lo.mistakeDepth + t * (hi.mistakeDepth - lo.mistakeDepth),
    }
  }
  // Unreachable: the bounds checks above cover [first.kyu, last.kyu] fully.
  return { mistakeChance: first.mistakeChance, mistakeDepth: first.mistakeDepth }
}

/** GNU Go reads at full depth; only move *selection* is weakened. */
const ENGINE_LEVEL = 10
const KOMI = 6.5

export async function createGame({
  targetKyu = 20,
  boardSize = 9,
  humanColor = 'black',
  mode = 'play',
} = {}) {
  const safeTargetKyu = Math.min(MAX_KYU, Math.max(MIN_KYU, Number(targetKyu)))
  const profile = difficultyForKyu(safeTargetKyu)
  const human = humanColor === 'white' ? 'white' : 'black'

  const engine = new GtpEngine({ level: ENGINE_LEVEL, boardSize, komi: KOMI })
  await engine.start()

  const game = {
    id: randomUUID(),
    engine,
    targetKyu: safeTargetKyu,
    ...profile,
    // Colours are decided by nigiri, so the human isn't always black.
    humanColor: human,
    aiColor: human === 'black' ? 'white' : 'black',
    boardSize,
    komi: KOMI,
    // 'teaching' turns on live per-move grading in the /move route below —
    // kept off by default since it costs two extra engine queries per human
    // move that plain Play mode has no use for.
    mode: mode === 'teaching' ? 'teaching' : 'play',
    moves: [],
    consecutivePasses: 0,
    over: false,
    result: null,
    lastUsed: Date.now(),
  }

  games.set(game.id, game)
  return game
}

/**
 * Parse GNU Go's estimate_score, e.g. "W+10.3 (upper bound: ...)", into a
 * single number expressed as black's advantage in points.
 */
export function parseEstimate(raw) {
  const match = /^([BW])\+([\d.]+)/i.exec(String(raw).trim())
  if (!match) return 0
  const points = Number.parseFloat(match[2])
  return match[1].toUpperCase() === 'B' ? points : -points
}

/**
 * Replay the game move by move, scoring the position after each one, and
 * report on every move the player made — not just their worst ones.
 *
 * A move is judged by how far the estimated score shifts against the player
 * across their own turn — comparing the position before their move with the
 * position straight after it, so the opponent's reply isn't blamed on them.
 * Analysis runs in a throwaway engine so the live game is untouched.
 */
const REVIEW_MOVE_CAP = 140
const BLUNDER_THRESHOLD = 6
const MISTAKE_THRESHOLD = 3
const INACCURACY_THRESHOLD = 1

/** Which bucket a point loss falls into — the same cutoffs used everywhere below. */
export function tierForLoss(loss) {
  if (loss >= BLUNDER_THRESHOLD) return 'blunder'
  if (loss >= MISTAKE_THRESHOLD) return 'mistake'
  if (loss >= INACCURACY_THRESHOLD) return 'inaccuracy'
  return 'good'
}

/**
 * A single honest number — average points lost per move — turned into a
 * short qualitative read. Nothing here claims to know the player's rank;
 * that's a separate, longer-run measure (see rank.js on the client).
 */
function performanceForAverageLoss(averageLoss) {
  if (averageLoss < 1) return { tier: 'excellent', label: 'Excellent — barely gave anything away.' }
  if (averageLoss < 2.5) return { tier: 'solid', label: 'Solid — a few small slips, nothing major.' }
  if (averageLoss < 5) return { tier: 'shaky', label: 'Shaky — some real points went missing.' }
  return { tier: 'rough', label: 'Rough — worth reviewing where it went wrong.' }
}

/**
 * The per-move estimate trace can genuinely miss a loss: a group that reads
 * as fine turn by turn (to GNU Go's static estimator) and then turns out to
 * have been dead the whole time collapses all at once, on a move that isn't
 * the human's own and so is never scored against them. Without this, a game
 * lost by a wide margin that way grades as "Excellent" — technically true of
 * the per-move numbers, and misleading about the game. This folds the actual
 * result in: a lopsided loss the move trace didn't see coming overrides the
 * average-loss verdict instead of silently disagreeing with it.
 */
function applyResultContext(perf, { game, averageLoss }) {
  const result = game.result
  if (!result || result.reason !== 'score' || typeof result.margin !== 'number') return perf
  if (result.winner === game.humanColor) return perf

  const boardPoints = game.boardSize * game.boardSize
  const marginFraction = result.margin / boardPoints
  if (marginFraction < 0.15 || averageLoss >= 2) return perf

  return {
    tier: 'rough',
    label: `Lost by ${result.margin} points — no single move stands out, but the position was likely difficult well before the score caught up to it.`,
  }
}

export async function reviewGame(game) {
  // A finished game's moves never change, so the analysis is deterministic —
  // cache it on the (in-memory, per-game) object rather than re-spawning a
  // GNU Go subprocess and redoing the full replay on every call. The cache
  // rides along with the game's own lifecycle (cleared when it's destroyed
  // or swept for inactivity), so there's nothing extra to invalidate.
  if (game._reviewCache) return game._reviewCache

  const engine = new GtpEngine({
    level: ENGINE_LEVEL,
    boardSize: game.boardSize,
    komi: game.komi,
  })

  try {
    await engine.start()
    const moves = game.moves.slice(0, REVIEW_MOVE_CAP)
    const sign = game.humanColor === 'black' ? 1 : -1
    const moveMarks = []
    let totalLoss = 0
    let humanMoveCount = 0

    let before = parseEstimate(await engine.send('estimate_score'))

    for (let i = 0; i < moves.length; i += 1) {
      const move = moves[i]
      if (move.resign) break
      if (move.pass) await engine.pass(move.color)
      else await engine.play(move.color, move.y, move.x)

      const after = parseEstimate(await engine.send('estimate_score'))

      if (move.color === game.humanColor && !move.pass) {
        // Positive delta = the position improved for the human.
        const delta = (after - before) * sign
        const loss = Math.max(0, Math.round(-delta * 10) / 10)
        humanMoveCount += 1
        totalLoss += loss
        moveMarks.push({
          moveNumber: i + 1,
          y: move.y,
          x: move.x,
          lost: loss,
          tier: tierForLoss(loss),
        })
      }
      before = after
    }

    const mistakes = moveMarks
      .filter((m) => m.tier === 'mistake' || m.tier === 'blunder')
      .sort((a, b) => b.lost - a.lost)
      .slice(0, 3)

    const averageLoss = humanMoveCount > 0 ? Math.round((totalLoss / humanMoveCount) * 10) / 10 : 0
    const performance = {
      averageLoss,
      ...applyResultContext(performanceForAverageLoss(averageLoss), { game, averageLoss }),
    }

    game._reviewCache = {
      analysed: moves.length,
      truncated: game.moves.length > REVIEW_MOVE_CAP,
      mistakes,
      moveMarks,
      performance,
    }
    return game._reviewCache
  } finally {
    await engine.quit().catch(() => {})
  }
}

/**
 * Pick the engine's move, weakened according to the game's level.
 *
 * Falls back to genmove whenever the candidate list is empty or its best move
 * is worth very little — near the end of a game genmove is what knows to pass,
 * and always playing a "top move" would keep filling the board forever.
 */
const PASS_DEFERRAL_VALUE = 6

export async function chooseEngineMove(game, color) {
  if (game.mistakeChance <= 0) {
    const move = await game.engine.genmove(color)
    // Full strength always plays its own best answer, no weakening involved.
    return { ...move, wasTopChoice: true }
  }

  const candidates = await game.engine.topMoves(color)
  if (candidates.length === 0 || candidates[0].value < PASS_DEFERRAL_VALUE) {
    const move = await game.engine.genmove(color)
    return { ...move, wasTopChoice: true }
  }

  let choice = candidates[0]
  let wasTopChoice = true
  if (Math.random() < game.mistakeChance && candidates.length > 1) {
    const pool = candidates.slice(1, Math.max(2, game.mistakeDepth))
    choice = pool[Math.floor(Math.random() * pool.length)]
    wasTopChoice = false
  }

  // topMoves only suggests, so the move has to be played explicitly.
  await game.engine.play(color, choice.y, choice.x)
  // wasTopChoice: true here means "declined to weaken this time" — a real,
  // honest signal Teaching Game mode uses to narrate the AI's own play.
  return { y: choice.y, x: choice.x, wasTopChoice }
}

/**
 * Teaching Game mode only: grade the human's move live against the same
 * engine actually playing the game (not reviewGame's throwaway replay
 * engine), so the chat bar can react to a real mistake or a genuinely good
 * move as it happens rather than waiting for the post-game review.
 *
 * Two calls, both read-only against the current position, so they're safe to
 * run before the move itself is played — `judgeHumanMoveAfter` below is what
 * has to run after.
 */
const GOOD_MOVE_CANDIDATE_DEPTH = 3

export async function judgeHumanMoveBefore(game) {
  const [candidates, estimate] = await Promise.all([
    game.engine.topMoves(game.humanColor),
    game.engine.send('estimate_score'),
  ])
  return { candidates: candidates.slice(0, GOOD_MOVE_CANDIDATE_DEPTH), before: parseEstimate(estimate) }
}

export async function judgeHumanMoveAfter(game, judging, y, x) {
  const after = parseEstimate(await game.engine.send('estimate_score'))
  const sign = game.humanColor === 'black' ? 1 : -1
  const delta = (after - judging.before) * sign
  const lost = Math.max(0, Math.round(-delta * 10) / 10)
  // Rank of the played point among the engine's own top candidates (0 = its
  // best move), or null if it wasn't one the engine was seriously considering.
  const candidateRank = judging.candidates.findIndex((c) => c.y === y && c.x === x)
  return { lost, tier: tierForLoss(lost), candidateRank: candidateRank === -1 ? null : candidateRank }
}

export function getGame(id) {
  const game = games.get(id)
  if (game) game.lastUsed = Date.now()
  return game
}

export async function destroyGame(id) {
  const game = games.get(id)
  if (!game) return false
  games.delete(id)
  await game.engine.quit()
  return true
}

/** The shape sent to the client — never leaks the engine handle. */
export function serialize(game) {
  return {
    id: game.id,
    targetKyu: game.targetKyu,
    humanColor: game.humanColor,
    aiColor: game.aiColor,
    boardSize: game.boardSize,
    komi: game.komi,
    moves: game.moves,
    over: game.over,
    result: game.result,
  }
}

const sweep = setInterval(() => {
  const cutoff = Date.now() - IDLE_TIMEOUT_MS
  for (const [id, game] of games) {
    if (game.lastUsed < cutoff) {
      games.delete(id)
      game.engine.quit().catch(() => {})
    }
  }
}, SWEEP_INTERVAL_MS)

// Don't hold the process open just for the sweeper.
sweep.unref?.()

export async function shutdown() {
  clearInterval(sweep)
  await Promise.all([...games.values()].map((g) => g.engine.quit().catch(() => {})))
  games.clear()
}
