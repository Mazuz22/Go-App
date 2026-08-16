import { regionOf } from './coords'

/**
 * Live chat-bar notes for Teaching Game mode.
 *
 * Unlike commentary.js's ambient flavor text (captures, atari, opening —
 * used in every regular Play game), these are grounded in the real per-move
 * analysis the server computes only in this mode: how many points a move
 * cost, and whether it matched one of the engine's own top candidates. See
 * judgeHumanMoveAfter / chooseEngineMove in server/games.js.
 *
 * Several phrasings per situation, picked at random, and each one references
 * *where* the move landed (via regionOf) rather than reusing one fixed
 * sentence regardless of the actual position — the tier alone repeating
 * byte-identical text every time is what made this feel canned before.
 */

const pick = (lines) => lines[Math.floor(Math.random() * lines.length)]

/**
 * `tier`/`lost` (before/after estimate_score) and `candidateRank` (GNU Go's
 * own move-generation ranking) are two independent reads of the position, and
 * can disagree — a move can be one of the engine's own top picks and still
 * score as a real point loss if a group's life/death status just resolved.
 * The point-loss warning has to win that conflict: telling a beginner "good
 * move" in the same beat their score visibly drops is worse than saying
 * nothing about the candidate match at all.
 *
 * @param quality {lost, tier, candidateRank} | null, from the /move response
 * @param point   {y, x} the point actually played, for region grounding
 * @param boardSize
 */
export function noteForHumanMove(quality, point, boardSize) {
  if (!quality) return null
  const { tier, lost, candidateRank } = quality
  const region = regionOf(point, boardSize)

  if (tier === 'blunder') {
    return pick(
      region
        ? [
            `That move in ${region} gives up real points — about ${lost}.`,
            `Ouch — that costs roughly ${lost} points in ${region}.`,
            `That's an expensive one: around ${lost} points slip away in ${region}.`,
          ]
        : [`That one gives up real points — about ${lost}.`, `That costs roughly ${lost} points.`],
    )
  }

  if (tier === 'mistake') {
    return pick(
      region
        ? [
            `That lets something go in ${region} — roughly ${lost} points.`,
            `A bit loose there — around ${lost} points drift away in ${region}.`,
            `That gives up ${region}, worth about ${lost} points.`,
          ]
        : [`That lets something go — roughly ${lost} points.`, `That's worth about ${lost} points to the other side.`],
    )
  }

  if (candidateRank === 0) {
    return pick(
      region
        ? [`That's the move I'd have played too.`, `Exactly what I was looking at in ${region}.`, `Same idea I had for ${region}.`]
        : [`That's the move I'd have played too.`, `Exactly what I was looking at.`],
    )
  }

  if (candidateRank === 1 || candidateRank === 2) {
    return pick([
      'Good idea — that was high on my list too.',
      'Nice — I was considering that one as well.',
      region ? `That's close to what I'd play in ${region}.` : "That's close to what I'd play there.",
    ])
  }

  if (tier === 'inaccuracy') {
    return pick(['A touch loose, but not a big deal.', 'Slightly off, nothing serious.', 'Small slip — easy to recover from.'])
  }

  // tier === 'good' but not a top-3 candidate: solid and unremarkable, not
  // worth a note — a beginner shouldn't get chat noise on every quiet move.
  return null
}

/**
 * @param ai the /move response's `ai` field (the engine's own reply)
 * @param boardSize
 */
export function noteForAiMove(ai, boardSize) {
  if (!ai || ai.pass || ai.resign || ai.wasTopChoice) return null
  const region = regionOf(ai, boardSize)
  // Only fires on a move the engine deliberately weakened (see mistakeChance
  // in server/games.js) — a real admission, not invented humility.
  return pick(
    region
      ? [
          `I'll play something a little softer here in ${region} — your move to punish if you can.`,
          `Not my strongest choice in ${region} — see if you can take advantage.`,
          `I'm holding back a bit in ${region} — worth a second look.`,
        ]
      : [
          "I'll play something a little softer here — it's your move to punish if you can.",
          "Not my strongest choice there — see if you can take advantage.",
        ],
  )
}
