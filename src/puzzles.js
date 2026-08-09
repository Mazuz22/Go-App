/**
 * Puzzles, easiest first. Same position/validation format as the tutorial
 * lessons — positions are reused from lessons that are known-good.
 *
 * Used two ways: as the skill assessment (Assessment.jsx), which hides the
 * `hint` field entirely — the point there is measurement, not teaching — and
 * as a standalone practice mode (Puzzles.jsx), which shows it on a wrong
 * attempt. `check` returns a plain boolean rather than lessons.js's
 * `{ok, message}` shape; Assessment relies on that exact contract.
 *
 * `difficulty` is a kyu rating (same scale as lib/rank.js — lower is
 * stronger) used by Puzzles.jsx to pick an adaptive round of 5 around the
 * player's current puzzle rating. Every position here has been checked
 * against the real GNU Go engine (setup legality + solution outcome via
 * `showboard`), not just hand-counted. Trickier categories that are harder
 * to verify with confidence from text output alone — ladders, nets, semeai,
 * multi-step classical eye shapes — are intentionally left out of this round
 * rather than risk shipping a puzzle whose "solution" isn't actually correct.
 */

const B = (y, x) => ({ color: 'black', y, x })
const W = (y, x) => ({ color: 'white', y, x })
const mark = (y, x, type = 'triangle') => ({ type, y, x })

const PUZZLES = [
  {
    id: 'p-capture',
    difficulty: 27,
    prompt: 'Black to play. Capture the marked stone.',
    setup: { toMove: 'black', stones: [W(4, 4), B(3, 4), B(5, 4), B(4, 3)] },
    marks: [mark(4, 4)],
    hint: 'It has only one liberty left — find it.',
    check: ({ state }) => state.whiteStonesCaptured > 0,
  },
  {
    id: 'p-corner-capture',
    difficulty: 26,
    prompt: 'Black to play. Capture the marked stone in the corner.',
    setup: { toMove: 'black', stones: [W(0, 0), B(0, 1)] },
    marks: [mark(0, 0)],
    hint: 'A corner stone only has two liberties to start with — one is already gone.',
    check: ({ state }) => state.whiteStonesCaptured > 0,
  },
  {
    id: 'p-edge-capture',
    difficulty: 24,
    prompt: 'Black to play. Capture the marked stone on the edge.',
    setup: { toMove: 'black', stones: [W(0, 4), B(0, 3), B(0, 5)] },
    marks: [mark(0, 4)],
    hint: "It's boxed in along the edge — one liberty remains.",
    check: ({ state }) => state.whiteStonesCaptured > 0,
  },
  {
    id: 'p-group',
    difficulty: 22,
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
    id: 'p-edge-atari',
    difficulty: 20,
    prompt: 'Black to play. Put the marked stone in atari.',
    setup: { toMove: 'black', stones: [W(0, 4), B(1, 4)] },
    marks: [mark(0, 4)],
    hint: 'It only has two liberties left along the edge — take either one.',
    check: ({ state }) =>
      state.intersectionAt(0, 4).value === 'white' && state.libertiesAt(0, 4) === 1,
  },
  {
    id: 'p-atari-both',
    difficulty: 18,
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
    id: 'p-double-atari-2',
    difficulty: 17,
    prompt: 'Black to play. Attack both marked stones with one move.',
    setup: {
      toMove: 'black',
      stones: [W(3, 3), W(2, 4), B(2, 3), B(3, 2), B(1, 4)],
    },
    marks: [mark(3, 3), mark(2, 4)],
    hint: 'Find the single point both marked stones still touch.',
    check: ({ state }) =>
      state.intersectionAt(3, 3).value === 'white' &&
      state.intersectionAt(2, 4).value === 'white' &&
      state.libertiesAt(3, 3) === 1 &&
      state.libertiesAt(2, 4) === 1,
  },
  {
    id: 'p-live',
    difficulty: 16,
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
    difficulty: 15,
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
  {
    id: 'p-bigger-capture-3',
    difficulty: 13,
    prompt: 'Black to play. Capture the marked group.',
    setup: {
      toMove: 'black',
      stones: [
        W(3, 3),
        W(3, 4),
        W(4, 4),
        B(2, 3),
        B(4, 3),
        B(2, 4),
        B(3, 5),
        B(5, 4),
        B(4, 5),
      ],
    },
    marks: [mark(3, 3), mark(3, 4), mark(4, 4)],
    hint: "Count its liberties — there's only one left.",
    check: ({ state }) => state.whiteStonesCaptured === 3,
  },
  {
    id: 'p-live-2',
    difficulty: 12,
    prompt: 'Black to play. Make the marked group alive.',
    setup: {
      toMove: 'black',
      stones: [B(7, 8), B(7, 7), B(7, 6), B(8, 5), W(6, 8), W(6, 7), W(6, 6), W(7, 5)],
    },
    marks: [mark(7, 8), mark(7, 7), mark(7, 6)],
    hint: 'The eye space has three points in a row — the middle one splits it into two eyes.',
    check: ({ playedPoint }) => playedPoint?.y === 8 && playedPoint?.x === 7,
  },
  {
    id: 'p-kill-2',
    difficulty: 11,
    prompt: 'Black to play. Stop the marked group from living.',
    setup: {
      toMove: 'black',
      stones: [W(1, 8), W(1, 7), W(1, 6), W(0, 5), B(2, 8), B(2, 7), B(2, 6), B(1, 5)],
    },
    marks: [mark(1, 8), mark(1, 7), mark(1, 6)],
    hint: 'Play the vital point that denies the group a second eye.',
    check: ({ playedPoint }) => playedPoint?.y === 0 && playedPoint?.x === 7,
  },
  {
    id: 'p-bigger-capture-4',
    difficulty: 9,
    prompt: 'Black to play. Capture the marked group.',
    setup: {
      toMove: 'black',
      stones: [
        W(3, 3),
        W(3, 4),
        W(4, 3),
        W(4, 4),
        B(2, 3),
        B(2, 4),
        B(3, 5),
        B(5, 3),
        B(4, 2),
        B(5, 4),
        B(4, 5),
      ],
    },
    marks: [mark(3, 3), mark(3, 4), mark(4, 3), mark(4, 4)],
    hint: "It's a tight square block — trace all its liberties before you play.",
    check: ({ state }) => state.whiteStonesCaptured === 4,
  },
]

export default PUZZLES

// Assessment.jsx wants a short, difficulty-spanning test, not the full
// (now much larger) practice bank — five puzzles across the difficulty
// range, in the same easiest-first order as PUZZLES itself.
const ASSESSMENT_IDS = ['p-capture', 'p-group', 'p-atari-both', 'p-kill', 'p-bigger-capture-4']
export const ASSESSMENT_PUZZLES = PUZZLES.filter((p) => ASSESSMENT_IDS.includes(p.id))
