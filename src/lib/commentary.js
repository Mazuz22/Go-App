import { regionOf } from './coords'

/**
 * Opponent commentary.
 *
 * Short remarks the engine "says" in reaction to what just happened, so the
 * game feels like it's being played against someone rather than against a
 * silent process. Everything here is derived from the board state — no
 * analysis is invented that the position doesn't support.
 *
 * Every line pool references `region` (via regionOf) when a point is
 * available — "that group in the corner" instead of just "that group" —
 * so the same event happening in different places doesn't read as the exact
 * same canned remark. `region` is folded into the sentence only where it
 * reads naturally; a couple of short reaction lines stay generic on purpose.
 */

const pick = (lines) => lines[Math.floor(Math.random() * lines.length)]

/** Groups adjacent to a point, by colour, deduplicated by their first stone. */
function neighbouringGroups(state, y, x, color) {
  const seen = new Set()
  const groups = []
  for (const n of state.neighborsFor(y, x)) {
    if (n.value !== color) continue
    const group = state.groupAt(n.y, n.x)
    const key = group.map((p) => `${p.y},${p.x}`).sort()[0]
    if (seen.has(key)) continue
    seen.add(key)
    groups.push(group)
  }
  return groups
}

// How many moves must pass since the AI last spoke before it's allowed to
// speak again just to fill silence — captures and atari always cut in line
// ahead of this, since those are worth interrupting for.
const IDLE_CHATTER_COOLDOWN = 4
const IDLE_CHATTER_CHANCE = 0.15

/**
 * @param prev            board state before the move
 * @param state           board state after it
 * @param mover           colour that just played
 * @param human           the player's colour
 * @param boardSize       for region grounding — omit to fall back to
 *                         ungrounded phrasing (e.g. a caller that hasn't
 *                         been updated)
 * @param lastRemarkMove  moveNumber the AI last spoke on, or null — gates
 *                        idle chatter only, so it doesn't fire every move
 * @returns a short line, or null when there's nothing worth saying
 */
export function commentOn({ prev, state, mover, human, boardSize = null, lastRemarkMove = null }) {
  if (!prev || !state) return null

  const opponentSpeaks = mover !== human
  const aiColor = human === 'black' ? 'white' : 'black'
  const point = state.playedPoint

  if (state.pass) {
    return opponentSpeaks ? pick(['Nothing useful left. I pass.', 'I pass.', 'I’ll pass here.']) : null
  }
  if (!point) return null

  const region = boardSize ? regionOf(point, boardSize) : null

  // Captures are the loudest thing that can happen, so they lead.
  const humanLost =
    human === 'black'
      ? state.blackStonesCaptured - prev.blackStonesCaptured
      : state.whiteStonesCaptured - prev.whiteStonesCaptured
  const aiLost =
    human === 'black'
      ? state.whiteStonesCaptured - prev.whiteStonesCaptured
      : state.blackStonesCaptured - prev.blackStonesCaptured

  if (humanLost > 0) {
    return humanLost === 1
      ? pick([
          region ? `I’ll take that one in ${region}.` : 'I’ll take that one.',
          region ? `That stone in ${region} was short of liberties.` : 'That stone was short of liberties.',
          'Thank you for that.',
        ])
      : pick([
          region
            ? `That group in ${region} had nowhere to go — ${humanLost} stones.`
            : `That group had nowhere to go — ${humanLost} stones.`,
          region ? `${humanLost} stones in ${region}, just like that.` : `${humanLost} stones, just like that.`,
        ])
  }
  if (aiLost > 0) {
    return aiLost === 1
      ? pick([
          region ? `Fair enough, you got the one in ${region}.` : 'Fair enough, you got it.',
          region ? `Well spotted in ${region}.` : 'Well spotted.',
          'I missed that one.',
        ])
      : pick([
          region ? `Ouch — ${aiLost} of mine in ${region}.` : `Ouch — ${aiLost} of mine.`,
          region ? `That cost me ${aiLost} stones in ${region}.` : `That cost me ${aiLost} stones.`,
        ])
  }

  // Then atari, which is the thing a beginner most often fails to notice.
  const humanGroupsInAtari = neighbouringGroups(state, point.y, point.x, human).filter(
    (g) => state.libertiesAt(g[0].y, g[0].x) === 1,
  )
  if (opponentSpeaks && humanGroupsInAtari.length > 0) {
    return pick([
      region ? `That group in ${region} is down to one liberty.` : 'That group of yours is down to one liberty.',
      region ? `Atari in ${region} — watch that group.` : 'Atari — watch that group.',
      region ? `One liberty left in ${region}.` : 'One liberty left there.',
    ])
  }

  const aiGroupsInAtari = neighbouringGroups(state, point.y, point.x, aiColor).filter(
    (g) => state.libertiesAt(g[0].y, g[0].x) === 1,
  )
  if (!opponentSpeaks && aiGroupsInAtari.length > 0) {
    return pick([
      region ? `You’ve got me in atari in ${region}.` : 'You’ve got me in atari.',
      region ? `That puts me in atari in ${region}.` : 'That puts me in atari.',
      region ? `I’m down to one liberty in ${region}.` : 'I’m down to one liberty.',
    ])
  }

  // A step short of atari — same idea, one liberty looser, so it reads as an
  // early warning rather than "you already lost this."
  const humanGroupsThin = opponentSpeaks
    ? neighbouringGroups(state, point.y, point.x, human).filter(
        (g) => state.libertiesAt(g[0].y, g[0].x) === 2,
      )
    : []
  if (humanGroupsThin.length > 0) {
    return pick([
      region ? `That group in ${region} is getting thin — two liberties.` : 'That group is getting thin — two liberties.',
      region ? `Worth checking that group’s liberties in ${region}.` : 'Worth checking that group’s liberties.',
    ])
  }

  const aiGroupsThin = !opponentSpeaks
    ? neighbouringGroups(state, point.y, point.x, aiColor).filter(
        (g) => state.libertiesAt(g[0].y, g[0].x) === 2,
      )
    : []
  if (aiGroupsThin.length > 0) {
    return pick([
      region ? `I’m getting a little thin in ${region}.` : 'I’m getting a little thin there.',
      region ? `I should look after that group in ${region} soon.` : 'I should look after that group soon.',
    ])
  }

  // Only about the opening.
  if (opponentSpeaks && state.moveNumber <= 6) {
    return pick([
      'Corners first — they’re the cheapest territory.',
      region ? `I’ll take ${region}.` : 'I’ll take a corner.',
      'Plenty of room yet.',
      'No need to fight yet — the board’s still open.',
    ])
  }

  // Otherwise, idle chatter: rare, cooldown-gated, and only about shape —
  // nothing here claims to know who's ahead, since that isn't derived.
  if (
    opponentSpeaks &&
    state.moveNumber > 10 &&
    (lastRemarkMove == null || state.moveNumber - lastRemarkMove >= IDLE_CHATTER_COOLDOWN) &&
    Math.random() < IDLE_CHATTER_CHANCE
  ) {
    return pick([
      region ? `That’s solid shape in ${region}.` : 'That’s solid shape.',
      region ? `Building some thickness in ${region}.` : 'Building some thickness there.',
      'Quiet move — but a useful one.',
      'This is turning into a real fight.',
      'Endgame’s going to matter here.',
      'I like the shape you’re building.',
    ])
  }

  return null
}
