import { useEffect, useRef, useState } from 'react'
import GoBoard from './GoBoard'

/**
 * Post-game review, replayed on the actual board instead of a static list.
 *
 * Steps through the finished game move by move — every human move gets a
 * quick colour-coded ring for its quality (see moveMarks, from reviewGame()
 * in server/games.js), and the worst few linger with a highlight and a
 * caption instead of just flashing by.
 */

const STEP_MS = 450
const MISTAKE_PAUSE_MS = 2600

export default function ReviewReplay({ moves, mistakes, moveMarks, performance, boardSize, coachNotes }) {
  const gameRef = useRef(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [playing, setPlaying] = useState(true)

  const atEnd = stepIndex >= moves.length
  // stepIndex counts moves already played, which is exactly the 1-indexed
  // moveNumber of whichever move was just placed on the board.
  const currentMark = stepIndex > 0 ? moveMarks.find((m) => m.moveNumber === stepIndex) : null
  const isFlagged = currentMark && mistakes.some((m) => m.moveNumber === stepIndex)
  const note = isFlagged && coachNotes?.find((n) => n.moveNumber === stepIndex)?.note

  // Drive playback: one move per tick, pausing longer on a flagged mistake so
  // it actually registers before moving on.
  useEffect(() => {
    if (!playing || atEnd) return
    const delay = isFlagged ? MISTAKE_PAUSE_MS : STEP_MS
    const timer = setTimeout(() => {
      playMoveAt(gameRef.current, moves[stepIndex])
      setStepIndex((i) => i + 1)
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stepIndex])

  // No seek in tenuki's API — a jump just replays the intervening moves
  // silently (no per-move pause) until it reaches the target.
  const jumpTo = (targetIndex) => {
    setPlaying(false)
    const game = gameRef.current
    if (!game) return
    for (let i = stepIndex; i < targetIndex && i < moves.length; i += 1) {
      playMoveAt(game, moves[i])
    }
    setStepIndex(targetIndex)
    setPlaying(true)
  }

  const nextMistake = mistakes.find((m) => m.moveNumber > stepIndex)

  return (
    <div className="review-replay">
      {performance && (
        <p className="review-performance">
          <strong>{performance.label}</strong>
          <span className="review-performance-detail">
            averaging {performance.averageLoss} pt{performance.averageLoss === 1 ? '' : 's'} lost per move
          </span>
        </p>
      )}

      <GoBoard
        boardSize={boardSize}
        locked
        showStatus={false}
        marks={
          currentMark
            ? [
                { type: 'circle', y: currentMark.y, x: currentMark.x, tone: currentMark.tier },
                // Same accent-circle language the live Hint bar already uses for
                // "the app is suggesting this point" — only shown on a flagged
                // mistake, and only once there's actually somewhere else to point.
                ...(isFlagged && currentMark.betterMove
                  ? [{ type: 'circle', y: currentMark.betterMove.y, x: currentMark.betterMove.x, tone: 'accent' }]
                  : []),
              ]
            : []
        }
        onReady={(game) => {
          gameRef.current = game
        }}
      />

      <div className="review-replay-caption">
        {isFlagged ? (
          <>
            <div className="review-replay-caption-head">
              <strong>Move {currentMark.moveNumber}</strong>
              <span className="review-cost">−{currentMark.lost} pts</span>
            </div>
            <p className="review-coach-note">
              {note ?? 'This move cost real points — worth a second look.'}
            </p>
            {currentMark.betterMove && (
              <p className="review-better-move">
                <span className="review-better-move-swatch" aria-hidden="true" />
                Better: the marked point instead.
              </p>
            )}
          </>
        ) : (
          <p className="review-replay-status">
            {atEnd
              ? mistakes.length === 0
                ? 'No single move cost you much — the game was decided gradually rather than by one blunder.'
                : 'Replay finished.'
              : `Move ${stepIndex} of ${moves.length}…`}
          </p>
        )}
      </div>

      <div className="review-replay-controls">
        <button type="button" className="ghost-button" onClick={() => setPlaying((p) => !p)} disabled={atEnd}>
          {playing && !atEnd ? 'Pause' : 'Play'}
        </button>
        {nextMistake && (
          <button type="button" className="ghost-button" onClick={() => jumpTo(nextMistake.moveNumber)}>
            Next mistake
          </button>
        )}
        {!atEnd && (
          <button type="button" className="ghost-button" onClick={() => jumpTo(moves.length)}>
            Skip to end
          </button>
        )}
      </div>
    </div>
  )
}

/** Applies one recorded move to a live tenuki game, in place. */
function playMoveAt(game, move) {
  if (!game || !move || move.resign) return
  if (move.pass) game.pass()
  else game.playAt(move.y, move.x)
}
