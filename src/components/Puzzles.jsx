import { useEffect, useRef, useState } from 'react'
import GoBoard from './GoBoard'
import PUZZLES from '../puzzles'

// How long a wrong move stays visible before it's retracted, so the player
// sees what they actually played rather than the stone vanishing instantly.
const REVERT_DELAY_MS = 600

/**
 * Standalone tactics practice — the same puzzle bank Assessment.jsx uses for
 * the one-time skill test, but played through openly: wrong attempts get a
 * hint and a retry instead of silently moving on.
 */
export default function Puzzles({ onExit }) {
  const [index, setIndex] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [solved, setSolved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const timer = useRef(null)
  const boardRef = useRef(null)

  const puzzle = PUZZLES[index]
  const isLast = index === PUZZLES.length - 1
  const studentColor = puzzle.setup.toMove

  useEffect(() => () => clearTimeout(timer.current), [puzzle, attempt])

  const resetTo = (nextIndex) => {
    clearTimeout(timer.current)
    setIndex(nextIndex)
    setAttempt((n) => n + 1)
    setFeedback(null)
    setSolved(false)
  }

  const handleMove = ({ game, state, playedPoint }) => {
    if (solved || state.color !== studentColor) return

    const ok = Boolean(puzzle.check({ state, playedPoint }))
    if (ok) {
      setSolved(true)
      setFeedback({ type: 'success', text: 'Solved.' })
      return
    }

    setFeedback({ type: 'error', text: puzzle.hint ?? 'Not quite — try again.' })
    // Deferred so we're not re-entering tenuki's render from inside its own
    // postRender callback, and so the move is briefly visible first.
    timer.current = setTimeout(() => game.undo(), REVERT_DELAY_MS)
  }

  return (
    <div className="tutorial">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Play
        </button>
        <span className="tutorial-progress">
          Puzzle {index + 1} of {PUZZLES.length}
        </span>
      </header>

      <div className="tutorial-brief">
        <h2>Puzzles</h2>
        <p className="tutorial-task">{puzzle.prompt}</p>
        {feedback && (
          <p className={`tutorial-feedback ${feedback.type}`}>{feedback.text}</p>
        )}
      </div>

      <GoBoard
        // Remount per puzzle/attempt so the board resets to the setup position.
        key={`${puzzle.id}-${attempt}`}
        boardSize={9}
        setup={puzzle.setup}
        marks={puzzle.marks}
        onMove={handleMove}
        onReady={(game) => {
          boardRef.current = game
        }}
        showStatus={false}
      />

      <div className="tutorial-footer">
        {solved ? (
          isLast ? (
            <button type="button" className="primary-button" onClick={onExit}>
              Finish
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => resetTo(index + 1)}
            >
              Next puzzle
            </button>
          )
        ) : (
          <div className="go-board-toolbar">
            <button type="button" onClick={() => resetTo(index)}>
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
