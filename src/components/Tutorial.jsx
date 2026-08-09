import { useEffect, useRef, useState } from 'react'
import GoBoard from './GoBoard'
import { PassIcon } from './icons'
import LESSONS from '../lessons'

// How long a rejected move stays visible before it's retracted, so the student
// sees what they actually played rather than the stone vanishing instantly.
const REVERT_DELAY_MS = 600
// Brief pause before the scripted opponent answers, so the exchange reads as
// two separate moves rather than both stones appearing at once.
const REPLY_DELAY_MS = 450

export default function Tutorial({ onExit, startIndex = 0 }) {
  const [index, setIndex] = useState(startIndex)
  const [feedback, setFeedback] = useState(null)
  const [solved, setSolved] = useState(false)
  // Bumped on every reset so the board remounts even when replaying the same
  // lesson, where the lesson id alone wouldn't change the key.
  const [attempt, setAttempt] = useState(0)
  // Current node of a move-tree lesson; null for predicate lessons.
  const treeNode = useRef(null)
  const timers = useRef([])
  const boardRef = useRef(null)

  const lesson = LESSONS[index]
  const isLast = index === LESSONS.length - 1
  const studentColor = lesson.setup.toMove

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  useEffect(() => {
    treeNode.current = lesson.tree ?? null
    return clearTimers
  }, [lesson, attempt])

  const resetTo = (nextIndex) => {
    clearTimers()
    setIndex(nextIndex)
    setAttempt((n) => n + 1)
    setFeedback(null)
    setSolved(false)
  }

  const reject = (game, message) => {
    setFeedback({ type: 'error', text: message || lesson.hint })
    // Deferred so we're not re-entering tenuki's render from inside its own
    // postRender callback, and so the move is briefly visible first.
    later(() => game.undo(), REVERT_DELAY_MS)
  }

  const succeed = () => {
    setSolved(true)
    setFeedback({ type: 'success', text: lesson.success })
  }

  const handleMove = ({ game, state, playedPoint }) => {
    // Scripted opponent replies come back through this same callback; only the
    // student's own colour should be validated.
    if (solved || state.color !== studentColor) return

    // A pass has no played point, so it's resolved before any board checks.
    if (state.pass) {
      if (lesson.allowPass) succeed()
      return
    }

    if (lesson.tree) {
      const node = treeNode.current
      const branch = node?.[`${playedPoint.y},${playedPoint.x}`]

      if (!branch || branch.wrong) {
        reject(game, branch?.wrong)
        return
      }

      if (branch.done) {
        succeed()
        return
      }

      if (branch.reply) {
        treeNode.current = branch.then ?? null
        if (branch.replyNote) setFeedback({ type: 'info', text: branch.replyNote })
        const [ry, rx] = branch.reply
        later(() => game.playAt(ry, rx), REPLY_DELAY_MS)
      }
      return
    }

    // Some lessons (e.g. the pass-only "ending the game" one) only define
    // allowPass and have no check/tree at all — any stone placement there is
    // simply not the expected move, not something to evaluate.
    if (!lesson.check) {
      reject(game)
      return
    }

    const result = lesson.check({ game, state, playedPoint })
    if (result.ok) succeed()
    else reject(game, result.message)
  }

  return (
    <div className="tutorial">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Lessons
        </button>
        <span className="tutorial-progress">
          Lesson {index + 1} of {LESSONS.length}
        </span>
      </header>

      <div className="tutorial-brief">
        <h2>{lesson.title}</h2>
        <p className="tutorial-intro">{lesson.intro}</p>
        <p className="tutorial-task">{lesson.task}</p>
        {feedback && (
          <p className={`tutorial-feedback ${feedback.type}`}>{feedback.text}</p>
        )}
      </div>

      <GoBoard
        // Remount per lesson/attempt so the engine is rebuilt with the setup.
        key={`${lesson.id}-${attempt}`}
        boardSize={9}
        setup={lesson.setup}
        marks={lesson.marks}
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
              Next lesson
            </button>
          )
        ) : (
          <div className="go-board-toolbar">
            {lesson.allowPass && (
              <button type="button" onClick={() => boardRef.current?.pass()}>
                <PassIcon />
                Pass
              </button>
            )}
            <button type="button" onClick={() => resetTo(index)}>
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
