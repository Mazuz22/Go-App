/**
 * Opponent commentary.
 *
 * Short remarks the engine "says" in reaction to what just happened, so the
 * game feels like it's being played against someone rather than against a
 * silent process. Everything here is derived from the board state — no
 * analysis is invented that the position doesn't support.
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
 * @param lastRemarkMove  moveNumber the AI last spoke on, or null — gates
 *                        idle chatter only, so it doesn't fire every move
 * @returns a short line, or null when there's nothing worth saying
 */
export function commentOn({ prev, state, mover, human, lastRemarkMove = null }) {
  if (!prev || !state) return null

  const opponentSpeaks = mover !== human
  const aiColor = human === 'black' ? 'white' : 'black'
  const point = state.playedPoint

  if (state.pass) {
    return opponentSpeaks ? pick(['Nothing useful left. I pass.', 'I pass.', 'I’ll pass here.']) : null
  }
  if (!point) return null

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
      ? pick(['I’ll take that one.', 'That stone was short of liberties.', 'Thank you for that.'])
      : pick([
          `That group had nowhere to go — ${humanLost} stones.`,
          `${humanLost} stones, just like that.`,
        ])
  }
  if (aiLost > 0) {
    return aiLost === 1
      ? pick(['Fair enough, you got it.', 'Well spotted.', 'I missed that one.'])
      : pick([`Ouch — ${aiLost} of mine.`, `That cost me ${aiLost} stones.`])
  }

  // Then atari, which is the thing a beginner most often fails to notice.
  const humanGroupsInAtari = neighbouringGroups(state, point.y, point.x, human).filter(
    (g) => state.libertiesAt(g[0].y, g[0].x) === 1,
  )
  if (opponentSpeaks && humanGroupsInAtari.length > 0) {
    return pick([
      'That group of yours is down to one liberty.',
      'Atari — watch that group.',
      'One liberty left there.',
    ])
  }

  const aiGroupsInAtari = neighbouringGroups(state, point.y, point.x, aiColor).filter(
    (g) => state.libertiesAt(g[0].y, g[0].x) === 1,
  )
  if (!opponentSpeaks && aiGroupsInAtari.length > 0) {
    return pick(['You’ve got me in atari.', 'That puts me in atari.', 'I’m down to one liberty.'])
  }

  // A step short of atari — same idea, one liberty looser, so it reads as an
  // early warning rather than "you already lost this."
  const humanGroupsThin = opponentSpeaks
    ? neighbouringGroups(state, point.y, point.x, human).filter(
        (g) => state.libertiesAt(g[0].y, g[0].x) === 2,
      )
    : []
  if (humanGroupsThin.length > 0) {
    return pick(['That group is getting thin — two liberties.', 'Worth checking that group’s liberties.'])
  }

  const aiGroupsThin = !opponentSpeaks
    ? neighbouringGroups(state, point.y, point.x, aiColor).filter(
        (g) => state.libertiesAt(g[0].y, g[0].x) === 2,
      )
    : []
  if (aiGroupsThin.length > 0) {
    return pick(['I’m getting a little thin there.', 'I should look after that group soon.'])
  }

  // Only about the opening.
  if (opponentSpeaks && state.moveNumber <= 6) {
    return pick([
      'Corners first — they’re the cheapest territory.',
      'I’ll take a corner.',
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
      'That’s solid shape.',
      'Building some thickness there.',
      'Quiet move — but a useful one.',
      'This is turning into a real fight.',
      'Endgame’s going to matter here.',
      'I like the shape you’re building.',
    ])
  }

  return null
}
