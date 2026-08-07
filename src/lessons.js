/**
 * Tutorial lessons.
 *
 * Ordering is deliberate: Go is a game about surrounding territory, and
 * capturing is a tactic in service of that. The goal is taught first, capture
 * is introduced as a means, and the sequence closes on scoring — so a beginner
 * doesn't leave with the usual misconception that Go is a capture game.
 *
 * Each lesson seeds a preset position (see lib/position.js). Two validation
 * styles are supported:
 *
 *   check(...)  a predicate over the resulting board state. Use when several
 *               moves are acceptable, or the goal is a property of the
 *               position ("is it in atari?") rather than a specific point.
 *
 *   tree{...}   a move tree keyed by "y,x", for exact sequences. A node may
 *               carry `done`, `wrong` (with its own message), or `reply` +
 *               `then` to script an opponent response. Unlisted moves fall
 *               back to `hint`.
 *
 * Setup stones are applied in array order and captures resolve as they go, so
 * order them such that no setup stone ever removes another.
 */

const B = (y, x) => ({ color: 'black', y, x })
const W = (y, x) => ({ color: 'white', y, x })
const mark = (y, x, type = 'triangle') => ({ type, y, x })

const LESSONS = [
  {
    id: 'place',
    title: 'Placing a stone',
    intro:
      'Go is played on the lines, not in the squares. Stones go where the lines cross — including on the edges and in the corners.',
    task: 'Black to play. Tap any intersection.',
    setup: { toMove: 'black', stones: [] },
    check: () => ({ ok: true }),
    success: 'Once played, a stone never moves — it can only be captured.',
  },

  {
    id: 'territory',
    title: 'Territory is the point',
    intro:
      'You do not win by capturing. You win by surrounding empty space. Empty points fenced in by your stones are your territory, and at the end the bigger territory wins.',
    task: 'Black to play. Close the last gap to surround the corner.',
    // Black's wall around the top-left corner is complete except at (2,3).
    setup: {
      toMove: 'black',
      stones: [
        B(0, 3), B(1, 3), B(3, 3), B(3, 2), B(3, 1), B(3, 0),
        W(0, 4), W(1, 4), W(2, 4), W(3, 4),
        W(4, 3), W(4, 2), W(4, 1), W(4, 0),
      ],
    },
    hint: 'One point on the black wall is still missing. Find the leak.',
    tree: {
      '2,3': { done: true },
    },
    success:
      'Those nine empty points in the corner are now Black\'s territory. Everything that follows — capturing included — is really about making territory like this.',
  },

  {
    id: 'liberties',
    title: 'Liberties',
    intro:
      'To hold territory your stones have to survive. The empty points touching a stone are its liberties, and a stone with none left is captured.',
    task: 'Black to play. Capture the marked white stone.',
    // White (4,4) is enclosed on three sides; its only liberty is (4,5).
    setup: { toMove: 'black', stones: [W(4, 4), B(3, 4), B(5, 4), B(4, 3)] },
    marks: [mark(4, 4)],
    hint: 'Find the one empty point still touching the marked stone.',
    check: ({ state }) =>
      state.whiteStonesCaptured > 0
        ? { ok: true }
        : { ok: false, message: 'That did not remove the stone. It still has a liberty left.' },
    success: 'Captured. With no liberties left, the stone came off the board.',
  },

  {
    id: 'atari',
    title: 'Atari',
    intro:
      'A stone with just one liberty left is in atari — one move away from capture. Announcing it is optional; noticing it is not.',
    task: 'Black to play. Put the marked stone in atari.',
    // White (4,4) has two liberties, (4,3) and (4,5); either is correct.
    setup: { toMove: 'black', stones: [W(4, 4), B(3, 4), B(5, 4)] },
    marks: [mark(4, 4)],
    hint: 'Take away one of its two remaining liberties.',
    check: ({ state }) => {
      const stone = state.intersectionAt(4, 4)
      if (stone.value !== 'white') {
        return {
          ok: false,
          message: 'The stone is gone — with two liberties it could not be captured in one move.',
        }
      }
      return state.libertiesAt(4, 4) === 1
        ? { ok: true }
        : { ok: false, message: 'It still has more than one liberty.' }
    },
    success: 'That stone is now in atari — a single move would capture it.',
  },

  {
    id: 'group',
    title: 'Capturing a group',
    intro:
      'Stones of the same colour sitting next to each other form one group and share their liberties. A group is captured all at once.',
    task: 'Black to play. Capture the marked group.',
    // White group (4,4)+(4,5) is enclosed except at (4,6).
    setup: {
      toMove: 'black',
      stones: [W(4, 4), W(4, 5), B(3, 4), B(3, 5), B(5, 4), B(5, 5), B(4, 3)],
    },
    marks: [mark(4, 4), mark(4, 5)],
    hint: 'The two stones share their liberties. Find the last one.',
    check: ({ state }) =>
      state.whiteStonesCaptured === 2
        ? { ok: true }
        : { ok: false, message: 'Both stones must come off at once — that was not their last liberty.' },
    success: 'Both came off together. Connected stones live and die as one group.',
  },

  {
    id: 'twoeyes',
    title: 'Two eyes',
    intro:
      'A group with two separate empty points inside it can never be captured — the opponent would have to fill both, and filling the last one is illegal. Two eyes means the group, and its territory, is safe forever.',
    task: 'Black to play. Split the space into two eyes so the marked group is safe.',
    // Black's group is enclosed with a three-point eye space at row 0.
    setup: {
      toMove: 'black',
      stones: [
        B(1, 0), B(1, 1), B(1, 2), B(0, 3),
        W(2, 0), W(2, 1), W(2, 2), W(1, 3),
      ],
    },
    marks: [mark(1, 0), mark(1, 1), mark(1, 2)],
    hint: 'The group has three empty points in a row. Divide them.',
    tree: {
      '0,1': { done: true },
      '0,0': {
        wrong: 'That fills your own space from the end, leaving one big eye — White could still kill it.',
      },
      '0,2': {
        wrong: 'That fills your own space from the end, leaving one big eye — White could still kill it.',
      },
    },
    success:
      'Two eyes at the corners of the space. That group is alive no matter what White does, so the territory behind it is secure.',
  },

  {
    id: 'doubleatari',
    title: 'Double atari',
    intro:
      'One move can put two separate groups in atari at the same time. Your opponent can only save one of them.',
    task: 'Black to play. Put both marked stones in atari with a single move.',
    // Each white stone has exactly two liberties, and they share (4,4).
    setup: {
      toMove: 'black',
      stones: [W(3, 4), B(2, 4), B(3, 3), W(5, 4), B(6, 4), B(5, 3)],
    },
    marks: [mark(3, 4), mark(5, 4)],
    hint: 'Look for the single point that both stones still touch.',
    tree: {
      '4,4': {
        // White can only rescue one stone; it saves the upper one.
        reply: [3, 5],
        replyNote: 'White runs with the upper stone — but the lower one is still in atari.',
        then: {
          '5,5': { done: true },
        },
      },
      '3,5': {
        wrong: 'That only threatens one stone. There is a move that attacks both at once.',
      },
      '5,5': {
        wrong: 'That only threatens one stone. There is a move that attacks both at once.',
      },
    },
    success:
      'That is a double atari. White could not defend both stones, so one of them was always going to fall.',
  },

  {
    id: 'ko',
    title: 'The ko rule',
    intro:
      'Sometimes a capture could be undone immediately, repeating the position forever. The ko rule forbids taking straight back.',
    task: 'Black to play. Capture the marked white stone.',
    // Standard ko shape: black takes at (4,4), and white may not retake at (4,3).
    setup: {
      toMove: 'black',
      stones: [W(4, 3), B(3, 3), B(5, 3), B(4, 2), W(3, 4), W(5, 4), W(4, 5)],
    },
    marks: [mark(4, 3)],
    hint: 'The marked stone has only one liberty left.',
    check: ({ state }) =>
      state.whiteStonesCaptured === 1
        ? { ok: true }
        : { ok: false, message: 'That was not the marked stone’s last liberty.' },
    success:
      'This is a ko. White would love to take straight back — but that would rebuild the position exactly, so the rules forbid it. White must play elsewhere first.',
  },

  {
    id: 'ending',
    title: 'Ending the game',
    intro:
      'Nobody fills the board. When there is nothing useful left to play, you pass. Two passes in a row end the game, and then the territory is counted.',
    task: 'Black to play. Nothing useful is left — pass to end the game.',
    // A settled position: the board is split cleanly down the middle.
    setup: {
      toMove: 'black',
      stones: [
        B(0, 3), B(1, 3), B(2, 3), B(3, 3), B(4, 3), B(5, 3), B(6, 3), B(7, 3), B(8, 3),
        W(0, 5), W(1, 5), W(2, 5), W(3, 5), W(4, 5), W(5, 5), W(6, 5), W(7, 5), W(8, 5),
      ],
    },
    allowPass: true,
    hint: 'There is no useful stone left to play. Use the Pass button.',
    success:
      'That is how a game ends. Each side counts the empty points it surrounds, plus any stones it captured, and the larger total wins. Territory decides the game — capturing is only ever a means to it.',
  },
]

export default LESSONS
