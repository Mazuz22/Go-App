import { useEffect, useState } from 'react'
import Logo from './Logo'
import ReviewReplay from './ReviewReplay'
import { TaskScreen } from './layout'
import * as api from '../lib/api'

/**
 * The finished game's post-mortem — a full screen entered from the
 * persistent board-conclusion panel's "Review my mistakes" action.
 *
 * PlayAI already runs this same GNU Go analysis once, silently, right after
 * the game ends (for the rating calc), and hands the result over as
 * `precomputedReview` — so most of the time this screen shows the review
 * immediately. When it doesn't have it yet, it fetches it itself behind a
 * loading screen rather than a busy button, since a fresh analysis is real
 * GNU Go work and can take a few seconds.
 */
export default function GameReview({
  gameId,
  moves,
  precomputedReview,
  boardSize,
  onBack,
  onHome,
  onRematch,
}) {
  const [review, setReview] = useState(precomputedReview)
  const [reviewError, setReviewError] = useState(null)
  const [coachNotes, setCoachNotes] = useState(null)
  const [coaching, setCoaching] = useState(false)
  const [coachError, setCoachError] = useState(null)

  useEffect(() => {
    if (review) return
    let cancelled = false
    api
      .reviewGame(gameId)
      .then((data) => {
        if (!cancelled) setReview(data)
      })
      .catch((err) => {
        if (!cancelled) setReviewError(err.message)
      })
    return () => {
      cancelled = true
    }
    // Runs once on entry — precomputedReview is just whatever PlayAI already
    // had in hand at that moment, not a value to react to changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  if (!review) {
    return (
      <div className="review-loading">
        <Logo size="lg" className="review-loading-mark" />
        <p className="review-loading-text">{reviewError ?? 'Analysing the game…'}</p>
        {reviewError && (
          <button type="button" className="ghost-button" onClick={onBack}>
            ← Back
          </button>
        )}
      </div>
    )
  }

  return (
    <TaskScreen
      onBack={onBack}
      backLabel="← Back"
      footer={
        <div className="game-over-actions in">
          <button type="button" className="primary-button" onClick={onRematch}>
            Play again
          </button>
          <button type="button" className="ghost-button" onClick={onHome}>
            Home
          </button>
        </div>
      }
    >
      <div className="review-body stagger">
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
          {coachError && <p className="screen-feedback error">{coachError}</p>}
        </div>
      </div>
    </TaskScreen>
  )
}
