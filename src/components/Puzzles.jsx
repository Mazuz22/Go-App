import { useEffect, useRef, useState } from 'react'
import GoBoard from './GoBoard'
import Logo from './Logo'
import PUZZLES, { CATEGORY_LABELS } from '../puzzles'
import * as api from '../lib/api'
import {
  DEFAULT_PUZZLE_KYU,
  formatRank,
  skillLabelForKyu,
  loadPuzzleRank,
  pickRound,
  savePuzzleRank,
  updatePuzzleRating,
} from '../lib/puzzleRank'

// How long a wrong move stays visible before it's retracted, so the player
// sees what they actually played rather than the stone vanishing instantly.
const REVERT_DELAY_MS = 600
const ROUND_SIZE = 5

const loadInitialRank = () => loadPuzzleRank() ?? { kyu: DEFAULT_PUZZLE_KYU, attempts: 0 }
const buildRound = (kyu, exclude) => pickRound(PUZZLES, kyu, ROUND_SIZE, exclude)

/**
 * Standalone tactics practice — the same puzzle bank Assessment.jsx draws a
 * short test from, played through openly: wrong attempts get a hint and a
 * retry instead of silently moving on. Puzzles come in adaptive rounds of
 * five, picked around the player's own puzzle rating (separate from their
 * in-game rank — see lib/puzzleRank.js), with the rating change revealed
 * once a round is complete.
 */
export default function Puzzles({ onExit }) {
  const [puzzleRank, setPuzzleRank] = useState(loadInitialRank)
  // Puzzles seen in the last round or two, so a fresh round doesn't just
  // hand back the same five — pickRound falls back to the full bank on its
  // own once this list leaves too little to choose from.
  const recentIdsRef = useRef([])

  const [round, setRound] = useState(() => buildRound(puzzleRank.kyu, recentIdsRef.current))
  const [ratingBefore, setRatingBefore] = useState(puzzleRank.kyu)
  const [roundIndex, setRoundIndex] = useState(0)
  const [roundResults, setRoundResults] = useState([])
  const [phase, setPhase] = useState('puzzle') // 'puzzle' | 'summary'
  const [feedback, setFeedback] = useState(null)
  const [solved, setSolved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [missedPoint, setMissedPoint] = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState(null)
  const timer = useRef(null)
  // Only the first attempt at a puzzle counts toward the rating — retrying
  // after a miss is still allowed (and still needed to move on), it just
  // stops affecting the number.
  const attemptCountedRef = useRef(false)
  // Bumped on every reset/advance so an in-flight explain request that
  // resolves after the player has already moved on doesn't land its answer
  // (or an error) on the wrong puzzle/attempt.
  const explainTokenRef = useRef(0)

  const puzzle = round[roundIndex]
  const isLastInRound = roundIndex === round.length - 1
  const studentColor = puzzle.setup.toMove

  useEffect(() => () => clearTimeout(timer.current), [puzzle, attempt])

  useEffect(() => {
    attemptCountedRef.current = false
  }, [puzzle.id])

  const handleMove = ({ game, state, playedPoint }) => {
    if (solved || state.color !== studentColor) return
    const ok = Boolean(puzzle.check({ state, playedPoint }))

    if (!attemptCountedRef.current) {
      attemptCountedRef.current = true
      const next = updatePuzzleRating(puzzleRank, {
        solved: ok,
        puzzleDifficulty: puzzle.difficulty,
      })
      setPuzzleRank(next)
      savePuzzleRank(next)
      setRoundResults((prev) => [...prev, ok])
    }

    if (ok) {
      setSolved(true)
      setFeedback({ type: 'success', text: 'Solved.' })
      return
    }
    setFeedback({ type: 'error', text: puzzle.hint ?? 'Not quite — try again.' })
    setMissedPoint(playedPoint)
    setExplanation(null)
    setExplainError(null)
    // Deferred so we're not re-entering tenuki's render from inside its own
    // postRender callback, and so the move is briefly visible first.
    timer.current = setTimeout(() => game.undo(), REVERT_DELAY_MS)
  }

  const askWhy = async () => {
    const token = explainTokenRef.current
    setExplaining(true)
    setExplainError(null)
    try {
      const { note } = await api.explainPuzzleMiss({
        boardSize: 9,
        stones: puzzle.setup.stones,
        prompt: puzzle.prompt,
        playedColor: studentColor,
        playedPoint: missedPoint,
      })
      if (explainTokenRef.current !== token) return
      setExplanation(note)
    } catch (err) {
      if (explainTokenRef.current !== token) return
      setExplainError(err.message)
    } finally {
      if (explainTokenRef.current === token) setExplaining(false)
    }
  }

  const handleReset = () => {
    clearTimeout(timer.current)
    explainTokenRef.current += 1
    setFeedback(null)
    setSolved(false)
    setAttempt((n) => n + 1)
    setMissedPoint(null)
    setExplanation(null)
    setExplainError(null)
  }

  const advance = () => {
    clearTimeout(timer.current)
    explainTokenRef.current += 1
    setFeedback(null)
    setSolved(false)
    setAttempt((n) => n + 1)
    setMissedPoint(null)
    setExplanation(null)
    setExplainError(null)
    if (isLastInRound) {
      recentIdsRef.current = [...recentIdsRef.current, ...round.map((p) => p.id)].slice(
        -(ROUND_SIZE * 2),
      )
      setPhase('summary')
    } else {
      setRoundIndex((i) => i + 1)
    }
  }

  const startNextRound = () => {
    explainTokenRef.current += 1
    setRound(buildRound(puzzleRank.kyu, recentIdsRef.current))
    setRatingBefore(puzzleRank.kyu)
    setRoundIndex(0)
    setRoundResults([])
    setPhase('puzzle')
    setFeedback(null)
    setSolved(false)
    setAttempt((n) => n + 1)
    setMissedPoint(null)
    setExplanation(null)
    setExplainError(null)
  }

  if (phase === 'summary') {
    return (
      <RoundSummary
        ratingBefore={ratingBefore}
        ratingAfter={puzzleRank.kyu}
        results={roundResults}
        onNextRound={startNextRound}
        onDone={onExit}
      />
    )
  }

  return (
    <div className="tutorial">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Play modes
        </button>
        <span className="tutorial-progress">
          Puzzle {roundIndex + 1} of {round.length}
        </span>
      </header>

      <div className="tutorial-brief">
        <h2>Puzzles</h2>
        {puzzle.category && (
          <span className="puzzle-category-badge">{CATEGORY_LABELS[puzzle.category] ?? puzzle.category}</span>
        )}
        <p className="tutorial-task">{puzzle.prompt}</p>
        {feedback && <p className={`tutorial-feedback ${feedback.type}`}>{feedback.text}</p>}
        {missedPoint && !explanation && (
          <button
            type="button"
            className="ghost-button review-coach-button"
            onClick={askWhy}
            disabled={explaining}
          >
            {explaining ? 'Asking the coach…' : 'Why was this wrong?'}
          </button>
        )}
        {explainError && <p className="tutorial-feedback error">{explainError}</p>}
        {explanation && <p className="tutorial-feedback">{explanation}</p>}
      </div>

      <GoBoard
        // Remount per puzzle/attempt so the board resets to the setup position.
        key={`${puzzle.id}-${attempt}`}
        boardSize={9}
        setup={puzzle.setup}
        marks={puzzle.marks}
        onMove={handleMove}
        showStatus={false}
      />

      <div className="tutorial-footer">
        {solved ? (
          <button type="button" className="primary-button" onClick={advance}>
            {isLastInRound ? 'See round results' : 'Next puzzle'}
          </button>
        ) : (
          <div className="go-board-toolbar">
            <button type="button" onClick={handleReset}>
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function RoundSummary({ ratingBefore, ratingAfter, results, onNextRound, onDone }) {
  const solvedCount = results.filter(Boolean).length
  // Positive delta = the rating got stronger (kyu number went down) — same
  // sign convention as rank.js's updateRatingAfterGame.
  const delta = ratingBefore - ratingAfter

  return (
    <div className="puzzle-round">
      <div className="puzzle-round-inner">
        <Logo size="md" className="puzzle-round-mark" />
        <h1 className="puzzle-round-headline">
          {solvedCount} / {results.length} solved
        </h1>
        <div className="puzzle-round-dots" aria-hidden="true">
          {results.map((hit, i) => (
            <span key={i} className={`puzzle-round-dot ${hit ? 'hit' : 'miss'}`}>
              {hit ? '✓' : '✕'}
            </span>
          ))}
        </div>
        <div className="puzzle-round-rating">
          <span className="game-over-rating-label">Puzzle rating</span>
          <span className="game-over-rating-value">
            {formatRank(ratingBefore)} → {formatRank(ratingAfter)}
          </span>
          {delta !== 0 && (
            <span className={`game-over-rating-delta ${delta > 0 ? 'up' : 'down'}`}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
            </span>
          )}
          <span className="game-over-rating-tier">{skillLabelForKyu(ratingAfter)}</span>
        </div>
        <p className="puzzle-round-note">
          Only your first try at each puzzle moves the rating — retries still help you solve it,
          they just don't count toward the number.
        </p>
        <div className="puzzle-round-actions">
          <button type="button" className="primary-button" onClick={onNextRound}>
            Next round
          </button>
          <button type="button" className="ghost-button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
