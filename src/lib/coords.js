/**
 * Plain-language advice for an early move, keyed off where it sits.
 *
 * Go counts lines from the edge starting at one, so the first line is the very
 * edge. Distances here are converted to that numbering before being described —
 * getting it wrong means telling someone their third-line move is on the second.
 *
 * The received wisdom: the third line makes solid territory, the fourth trades
 * certainty for influence over the centre, and the first two make almost
 * nothing. Corners come first because they need the fewest stones to enclose.
 */
export function describeOpening(point, boardSize, moveNumber) {
  if (!point || moveNumber > 6) return null

  const distances = [point.y, point.x, boardSize - 1 - point.y, boardSize - 1 - point.x]
  const line = Math.min(...distances) + 1 // 1-indexed, as Go counts them

  const fromTopBottom = Math.min(point.y, boardSize - 1 - point.y)
  const fromSides = Math.min(point.x, boardSize - 1 - point.x)
  const cornerReach = boardSize <= 9 ? 3 : 4
  const inCorner = fromTopBottom < cornerReach && fromSides < cornerReach

  if (line <= 2) {
    return 'The first two lines make almost no territory this early — play a line or two further in.'
  }

  if (inCorner) {
    return line === 3
      ? 'A corner on the third line: solid, and territory here is the cheapest on the board.'
      : 'A corner on the fourth line: slightly less certain than the third, but it looks out at the rest of the board.'
  }

  if (boardSize <= 9) {
    // On 9x9 the centre is a serious opening, not a beginner's mistake: a
    // central stone presses in all four directions, and it stops White simply
    // splitting the board into two even halves and winning on komi.
    return 'On 9×9 the centre is a real opening. A stone here presses in every direction, and it stops White splitting the board into two even halves.'
  }

  if (line >= 5) {
    return 'The centre is the most expensive place to make territory. Corners first, then sides.'
  }

  return line === 3
    ? 'A side extension on the third line — steady, and it makes territory along the edge.'
    : 'A side extension on the fourth line, aiming at influence rather than immediate territory.'
}
