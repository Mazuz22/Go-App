import { useEffect, useState } from 'react'
import Logo from './Logo'
import ReviewReplay from './ReviewReplay'
import * as api from '../lib/api'
import { formatRank } from '../lib/rank'

/**
 * End-of-game screen.
 *
 * A result that only appears as a line of text under the board is easy to miss
 * entirely — a resignation especially, since nothing else on the board changes
 * to announce it. So the game ends on its own screen, revealed in stages.
 */
const REASON_TEXT = {
  resignation: 'by resignation',
  timeout: 'on time',
  score: 'on the board',
}

export default function GameOver({
  result,
  humanColor,
  gameId,
  moves = [],
  ratingChange,
  boardSize = 9,
  onRematch,
  onHome,
}) {
  const [step, setStep] = useState(0)
  const [review, setReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState(null)
  const [coachNotes, setCoachNotes] = useState(null)
  const [coaching, setCoaching] = useState(false)
  const [coachError, setCoachError] = useState(null)

  const runReview = async () => {
    setReviewing(true)
    setReviewError(null)
    try {
      setReview(await api.reviewGame(gameId))
    } catch (err) {
      setReviewError(err.message)
    } finally {
      setReviewing(false)
    }
  }

  // A second, separate step (rather than folding into runReview): the score
  // analysis is free and instant, this calls out to Claude, so it's opt-in.
  const runCoach = async () => {
    setCoaching(true)
    setCoachError(null)
    try {
      const { notes } = await api.explainMistakes(gameId, review.mistakes)
      setCoachNotes(notes)
    } catch (err) {
      setCoachError(err.message)
    } finally {
      setCoaching(false)
    }
  }

  // Staged reveal: outcome, then the detail, then the actions.
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 260),
      setTimeout(() => setStep(2), 720),
      setTimeout(() => setStep(3), 1100),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const won = result.winner === humanColor
  const winnerLabel = result.winner === 'black' ? 'Black' : 'White'

  return (
    <div className={`game-over ${won ? 'won' : 'lost'}`}>
      <div className="game-over-inner">
        <Logo size="md" className="game-over-mark" />

        <div className={`game-over-stone ${result.winner}${step >= 1 ? ' in' : ''}`} aria-hidden="true" />

        <h1 className={`game-over-headline${step >= 1 ? ' in' : ''}`}>
          {won ? 'You win' : 'You lose'}
        </h1>

        <p className={`game-over-reason${step >= 2 ? ' in' : ''}`}>
          {winnerLabel} wins {REASON_TEXT[result.reason] ?? ''}
          {result.detail ? ` · ${result.detail}` : ''}
        </p>

        {result.score && (
          <div className={`game-over-score${step >= 2 ? ' in' : ''}`}>
            <div className="game-over-score-side">
              <span className="game-over-score-label">Black</span>
              <span className="game-over-score-value">{result.score.black}</span>
            </div>
            <div className="game-over-score-divider" />
            <div className="game-over-score-side">
              <span className="game-over-score-label">White</span>
              <span className="game-over-score-value">{result.score.white}</span>
            </div>
          </div>
        )}

        {ratingChange && (
          <div className={`game-over-rating${step >= 2 ? ' in' : ''}`}>
            <span className="game-over-rating-label">Rating</span>
            <span className="game-over-rating-value">
              {formatRank(ratingChange.from)} → {formatRank(ratingChange.to)}
            </span>
            <span className={`game-over-rating-delta ${ratingChange.delta > 0 ? 'up' : 'down'}`}>
              {ratingChange.delta > 0 ? '▲' : '▼'} {Math.abs(ratingChange.delta).toFixed(1)}
            </span>
          </div>
        )}

        {/* Post-game analysis: the engine replays the game and scores each
            position, so the moves that actually cost the most are named —
            watched happening on the board rather than read as a list. */}
        {review && (
          <div className="review">
            <h2 className="review-title">Where it turned</h2>
            <ReviewReplay
              moves={moves}
              mistakes={review.mistakes}
              moveMarks={review.moveMarks}
              performance={review.performance}
              boardSize={boardSize}
              coachNotes={coachNotes}
            />
            {review.mistakes.length > 0 && (
              <p className="review-note">
                Measured by how far the estimated score moved against you
                across your own turn.
              </p>
            )}
            {review.mistakes.length > 0 && !coachNotes && (
              <button
                type="button"
                className="ghost-button review-coach-button"
                onClick={runCoach}
                disabled={coaching}
              >
                {coaching ? 'Asking the coach…' : 'Explain these mistakes'}
              </button>
            )}
            {coachError && <p className="tutorial-feedback error">{coachError}</p>}
          </div>
        )}

        {reviewError && <p className="tutorial-feedback error">{reviewError}</p>}

        <div className={`game-over-actions${step >= 3 ? ' in' : ''}`}>
          {!review && gameId && (
            <button
              type="button"
              className="ghost-button"
              onClick={runReview}
              disabled={reviewing}
            >
              {reviewing ? 'Analysing the game…' : 'Review my mistakes'}
            </button>
          )}
          <button type="button" className="primary-button" onClick={onRematch}>
            Play again
          </button>
          <button type="button" className="ghost-button" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
