/**
 * Preset board positions.
 *
 * tenuki 0.3.1 has no public API for starting a game from a given position:
 * `Game.playAt()` always plays as `currentPlayer()` and strictly alternates,
 * so a position like "white stone in atari, black to kill" can't be expressed.
 *
 * `BoardState.playAt(y, x, color)` *does* take an explicit color and returns a
 * new state, so we fold the setup stones into a single state and seed it as
 * the game's only move.
 *
 * This is the one place in the app that touches tenuki's private `_moves`,
 * deliberately isolated so a tenuki upgrade breaks exactly one file.
 */

/**
 * @param game   a tenuki Game
 * @param stones [{ color: 'black'|'white', y, x }] applied in order
 * @param toMove which color should play first once the position is set
 */
export function applySetup(game, { stones = [], toMove = 'black' } = {}) {
  let state = game.currentState()

  // BoardState.playAt does not enforce legality (Game does that before
  // delegating), so stones can be placed freely — but captures still resolve.
  // Order setup stones so none of them capture each other.
  for (const { color, y, x } of stones) {
    state = state.playAt(y, x, color)
  }

  // nextColor() is just the opposite of the state's own `color`, so we record
  // the *opponent* as having played last in order to hand `toMove` the turn.
  // Counters are zeroed so any captures made while building the position
  // aren't attributed to the student.
  state = state.copyWithAttributes({
    color: toMove === 'black' ? 'white' : 'black',
    moveNumber: 0,
    playedPoint: null,
    pass: false,
    capturedPositions: [],
    blackStonesCaptured: 0,
    whiteStonesCaptured: 0,
    koPoint: null,
  })

  game._moves = [state]
  game.render()
}

/** Stones currently on the board, as a plain array. */
export function stonesOnBoard(game) {
  return game
    .intersections()
    .filter((i) => i.value !== 'empty')
    .map((i) => ({ color: i.value, y: i.y, x: i.x }))
}
