/**
 * Live chat-bar notes for Teaching Game mode.
 *
 * Unlike commentary.js's ambient flavor text (captures, atari, opening —
 * used in every regular Play game), these are grounded in the real per-move
 * analysis the server computes only in this mode: how many points a move
 * cost, and whether it matched one of the engine's own top candidates. See
 * judgeHumanMoveAfter / chooseEngineMove in server/games.js.
 */

/** @param quality {lost, tier, candidateRank} | null, from the /move response */
export function noteForHumanMove(quality) {
  if (!quality) return null
  const { tier, lost, candidateRank } = quality

  if (candidateRank === 0) return "That's the move I'd have played too."
  if (candidateRank === 1 || candidateRank === 2) return 'Good idea — that was high on my list too.'

  if (tier === 'blunder') return `That one gives up real points — about ${lost}.`
  if (tier === 'mistake') return `That lets something go — roughly ${lost} points.`
  if (tier === 'inaccuracy') return 'A touch loose, but not a big deal.'

  // tier === 'good' but not a top-3 candidate: solid and unremarkable, not
  // worth a note — a beginner shouldn't get chat noise on every quiet move.
  return null
}

/** @param ai the /move response's `ai` field (the engine's own reply) */
export function noteForAiMove(ai) {
  if (!ai || ai.pass || ai.resign || ai.wasTopChoice) return null
  // Only fires on a move the engine deliberately weakened (see mistakeChance
  // in server/games.js) — a real admission, not invented humility.
  return "I'll play something a little softer here — it's your move to punish if you can."
}
