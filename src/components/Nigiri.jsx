import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Nigiri (握り) — the traditional way of deciding colours.
 *
 * One player grabs a handful of white stones; the opponent guesses whether the
 * count is odd or even by laying down one or two black stones. Guess right and
 * you take black, which moves first.
 *
 * Played out in stages rather than resolved instantly: the hand closes, you
 * guess, then the stones spill out one at a time and are counted. The suspense
 * is the point of the ritual.
 */
const MAX_HANDFUL = 18
const STONE_INTERVAL_MS = 85
const VERDICT_PAUSE_MS = 450

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function Nigiri({ onDecided, onCancel, boardLabel = null, busy = false }) {
  // Fixed for the life of the screen so the answer can't shift after guessing.
  const handful = useMemo(() => 1 + Math.floor(Math.random() * MAX_HANDFUL), [])
  const [phase, setPhase] = useState('guess') // guess -> revealing -> done
  const [guess, setGuess] = useState(null)
  const [revealed, setRevealed] = useState(0)
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const isEven = handful % 2 === 0
  const correct = guess !== null && (guess === 'even') === isEven
  const humanColor = correct ? 'black' : 'white'

  const makeGuess = (choice) => {
    setGuess(choice)
    setPhase('revealing')

    if (prefersReducedMotion()) {
      setRevealed(handful)
      setPhase('done')
      return
    }

    // Stones land one at a time, so the count builds rather than appearing.
    for (let i = 1; i <= handful; i += 1) {
      timers.current.push(setTimeout(() => setRevealed(i), i * STONE_INTERVAL_MS))
    }
    timers.current.push(
      setTimeout(() => setPhase('done'), handful * STONE_INTERVAL_MS + VERDICT_PAUSE_MS),
    )
  }

  return (
    <div className="level-select nigiri">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onCancel}>
          ← Board
        </button>
        <span className="tutorial-progress">{boardLabel ?? 'Nigiri'}</span>
      </header>

      <div className="level-select-body stagger">
        <h2>握り · Nigiri</h2>

        {phase === 'guess' ? (
          <p className="level-select-note">
            Your opponent has taken a handful of white stones. Guess whether
            there is an odd or even number — lay down one stone for odd, two for
            even. Guess right and you play black, and move first.
          </p>
        ) : (
          <p className="level-select-note">
            You said <strong>{guess}</strong>. The hand opens…
          </p>
        )}

        {/*
          The class must not change between `revealing` and `done`, or the
          browser restarts the opening animation and the fist reappears.
        */}
        <div className={`nigiri-stage ${phase === 'guess' ? 'closed' : 'opened'}`}>
          <div className="nigiri-fist" aria-hidden="true">
            <span className="nigiri-fist-inner" />
          </div>

          <div className="nigiri-spill" aria-hidden="true">
            {Array.from({ length: revealed }, (_, i) => (
              <span
                key={i}
                className="nigiri-stone white dropped"
                style={{ animationDelay: `${(i % 6) * 20}ms` }}
              />
            ))}
          </div>

          {phase !== 'guess' && (
            <p className="nigiri-count" aria-live="polite">
              <span className="nigiri-count-number">{revealed}</span>
              <span className="nigiri-count-label">
                {revealed === 1 ? 'stone' : 'stones'}
                {phase === 'done' && ` · ${isEven ? 'even' : 'odd'}`}
              </span>
            </p>
          )}
        </div>

        {phase === 'guess' && (
          <div className="level-list nigiri-choices">
            <button type="button" className="level-card" onClick={() => makeGuess('odd')}>
              <span className="nigiri-stones">
                <span className="nigiri-stone black" />
              </span>
              <span className="level-name">Odd</span>
              <span className="level-blurb">Lay down one stone.</span>
            </button>
            <button type="button" className="level-card" onClick={() => makeGuess('even')}>
              <span className="nigiri-stones">
                <span className="nigiri-stone black" />
                <span className="nigiri-stone black" />
              </span>
              <span className="level-name">Even</span>
              <span className="level-blurb">Lay down two stones.</span>
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="nigiri-verdict">
            <p className={`tutorial-feedback ${correct ? 'success' : 'error'}`}>
              {correct ? 'You guessed right.' : 'Not this time.'} You play{' '}
              <strong>{humanColor}</strong>
              {humanColor === 'black' ? ' and move first.' : '; your opponent moves first.'}
            </p>
            <button
              type="button"
              className="primary-button nigiri-continue"
              disabled={busy}
              onClick={() => onDecided(humanColor)}
            >
              {busy ? 'Starting…' : 'Start game'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
