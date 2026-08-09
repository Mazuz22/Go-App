/**
 * Puzzles, easiest first. Same position/validation format as the tutorial
 * lessons — positions are reused from lessons that are known-good.
 *
 * Used two ways: as the skill assessment (Assessment.jsx), which hides the
 * `hint` field entirely — the point there is measurement, not teaching — and
 * as a standalone practice mode (Puzzles.jsx), which shows it on a wrong
 * attempt. `check` returns a plain boolean rather than lessons.js's
 * `{ok, message}` shape; Assessment relies on that exact contract.
 */

const B = (y, x) => ({ color: 'black', y, x })
const W = (y, x) => ({ color: 'white', y, x })
const mark = (y, x, type = 'triangle') => ({ type, y, x })

const PUZZLES = [
  {
    id: 'p-capture',
    prompt: 'Black to play. Capture the marked stone.',
    setup: { toMove: 'black', stones: [W(4, 4), B(3, 4), B(5, 4), B(4, 3)] },
    marks: [mark(4, 4)],
    hint: 'It has only one liberty left — find it.',
    check: ({ state }) => state.whiteStonesCaptured > 0,
  },
  {
    id: 'p-group',
    prompt: 'Black to play. Capture the marked group.',
    setup: {
      toMove: 'black',
      stones: [W(4, 4), W(4, 5), B(3, 4), B(3, 5), B(5, 4), B(5, 5), B(4, 3)],
    },
    marks: [mark(4, 4), mark(4, 5)],
    hint: 'The two stones share their last liberty — find it.',
    check: ({ state }) => state.whiteStonesCaptured === 2,
  },
  {
    id: 'p-atari-both',
    prompt: 'Black to play. Attack both marked stones with one move.',
    setup: {
      toMove: 'black',
      stones: [W(3, 4), B(2, 4), B(3, 3), W(5, 4), B(6, 4), B(5, 3)],
    },
    marks: [mark(3, 4), mark(5, 4)],
    hint: 'Look for the single point that both marked stones still touch.',
    // Correct only if both white stones end up with a single liberty.
    check: ({ state }) =>
      state.intersectionAt(3, 4).value === 'white' &&
      state.intersectionAt(5, 4).value === 'white' &&
      state.libertiesAt(3, 4) === 1 &&
      state.libertiesAt(5, 4) === 1,
  },
  {
    id: 'p-live',
    prompt: 'Black to play. Make the marked group alive.',
    setup: {
      toMove: 'black',
      stones: [B(1, 0), B(1, 1), B(1, 2), B(0, 3), W(2, 0), W(2, 1), W(2, 2), W(1, 3)],
    },
    marks: [mark(1, 0), mark(1, 1), mark(1, 2)],
    hint: 'The eye space has three points in a row — the middle one splits it into two eyes.',
    // Only the middle of the three-point eye space splits it into two eyes.
    check: ({ playedPoint }) => playedPoint?.y === 0 && playedPoint?.x === 1,
  },
  {
    id: 'p-kill',
    prompt: 'Black to play. Stop the marked group from living.',
    setup: {
      toMove: 'black',
      stones: [W(1, 0), W(1, 1), W(1, 2), W(0, 3), B(2, 0), B(2, 1), B(2, 2), B(1, 3)],
    },
    marks: [mark(1, 0), mark(1, 1), mark(1, 2)],
    hint: 'Play the vital point that denies the group a second eye.',
    // The vital point is the middle: it denies white a second eye.
    check: ({ playedPoint }) => playedPoint?.y === 0 && playedPoint?.x === 1,
  },
]

export default PUZZLES
