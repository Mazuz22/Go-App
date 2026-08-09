import { useRef, useState } from 'react'
import GoBoard from './GoBoard'
import Logo from './Logo'
import PUZZLES from '../puzzles'
import { EXPERIENCE_OPTIONS, kyuFromScore } from '../lib/rank'

// Long enough to see the refuted move before the next puzzle replaces it.
const NEXT_DELAY_MS = 700

/**
 * Works out how strong the player is, to seed their starting rating rather
 * than asking them to pick one blind. Either they say, or they take a short
 * test — both produce a kyu estimate.
 */
export default function Assessment({ onDone, onCancel }) {
  const [mode, setMode] = useState('ask')
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [answered, setAnswered] = useState(null)
  const timer = useRef(null)

  const finish = (kyu, source) => {
    onDone({ kyu, source, gamesPlayed: 0, assessedAt: Date.now() })
  }

  const puzzle = PUZZLES[index]

  const handleMove = ({ state, playedPoint }) => {
    if (state.color !== 'black' || answered) return

    const ok = Boolean(puzzle.check({ state, playedPoint }))
    setAnswered(ok ? 'right' : 'wrong')
    const score = correct + (ok ? 1 : 0)
    if (ok) setCorrect(score)

    timer.current = setTimeout(() => {
      setAnswered(null)
      if (index + 1 < PUZZLES.length) {
        setIndex(index + 1)
      } else {
        finish(kyuFromScore(score, PUZZLES.length), 'puzzles')
      }
    }, NEXT_DELAY_MS)
  }

  if (mode === 'ask') {
    return (
      <div className="level-select">
        <header className="tutorial-header">
          <button type="button" className="link-button" onClick={onCancel}>
            ← Home
          </button>
        </header>
        <div className="level-select-body stagger">
          <Logo size="md" className="screen-mark" />
          <h2>How much Go have you played?</h2>
          <p className="level-select-note">
            This sets your starting rating — it adjusts automatically as you play.
          </p>
          <div className="level-list">
            {EXPERIENCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="level-card"
                onClick={() => finish(option.kyu, 'self')}
              >
                <span className="level-name">{option.label}</span>
                <span className="level-blurb">{option.blurb}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="link-button assessment-switch"
            onClick={() => setMode('puzzles')}
          >
            Not sure? Take a short test instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tutorial">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={() => setMode('ask')}>
          ← Back
        </button>
        <span className="tutorial-progress">
          Puzzle {index + 1} of {PUZZLES.length}
        </span>
      </header>

      <div className="tutorial-brief">
        <h2>Quick test</h2>
        <p className="tutorial-task">{puzzle.prompt}</p>
      </div>

      <GoBoard
        // Remount per puzzle so each starts from its own position.
        key={puzzle.id}
        boardSize={9}
        setup={puzzle.setup}
        marks={puzzle.marks}
        onMove={handleMove}
        showStatus={false}
        locked={Boolean(answered)}
      />

      <div className="tutorial-footer">
        {/* No right/wrong feedback: this is a measurement, not a lesson. */}
        <p className="tutorial-feedback info">
          {answered ? 'Answer recorded.' : 'Play your move. There are no hints here.'}
        </p>
      </div>
    </div>
  )
}
