import { useEffect, useRef, useState } from 'react'
import GoBoard from './GoBoard'
import GameReview from './GameReview'
import Logo from './Logo'
import { HintIcon, PassIcon, ResignIcon } from './icons'
import { LevelSelectScreen, PlayScreen } from './layout'
import * as api from '../lib/api'
import { commentOn } from '../lib/commentary'
import { noteForAiMove, noteForHumanMove } from '../lib/teachingCommentary'
import { describeOpening } from '../lib/coords'
import {
  formatRank,
  skillLabelForKyu,
  AI_LEVELS,
  aiLevelForKyu,
  updateRatingAfterGame,
  MIN_KYU,
  MAX_KYU,
} from '../lib/rank'
import { useCountUp } from '../lib/useCountUp'

// No handicap: every game starts from an empty board and the engine is
// weakened by how it plays (see server/games.js), not by stones given away.
// Colour is assigned by a coin flip rather than the traditional nigiri
// ritual — the point here is getting to the first move fast, not ceremony.

/**
 * Board size is really a choice about how long you want to sit down for, so
 * it's presented that way. Only the full board is played on a clock — the
 * smaller boards are untimed so a beginner can think as long as they like.
 * Clock time is each player's own main time and, as in chess, only the player
 * to move burns it. Running out loses the game.
 */
const FORMATS = [
  { id: 'quick', name: 'Quick', minutes: null, boardSize: 9, blurb: 'A full game over a coffee. No clock.' },
  { id: 'medium', name: 'Medium', minutes: null, boardSize: 13, blurb: 'Room to make shape. No clock.' },
  { id: 'full', name: 'Full', minutes: 45, boardSize: 19, blurb: 'The real board, on a 45 minute clock.' },
]

const REASON_TEXT = {
  resignation: 'by resignation',
  timeout: 'on time',
  score: 'on the board',
}

// How the end-of-game territory sweep is paced: total sweep time scales with
// how many points there are to count, clamped so a tiny territory doesn't
// feel instant and a huge one doesn't drag.
const COUNT_DURATION_MS = 900
const MIN_SWEEP_MS = 650
const MAX_SWEEP_MS = 2200
const SWEEP_MS_PER_POINT = 55

export default function PlayAI({ onExit, rank, onRankChange }) {
  // Pre-game is a single screen: pick a board size and the game starts
  // immediately, matched to your own rating and a randomly assigned colour.
  // Opponent strength is adjustable there too, but as an optional disclosure
  // rather than a step you have to pass through.
  const [format, setFormat] = useState(null)
  // 'play' (default, silent) or 'teaching' (live chat-bar notes grounded in
  // real per-move analysis) — set explicitly on the picker below.
  const [mode, setMode] = useState('play')
  const [teachingLog, setTeachingLog] = useState([])
  const teachingLogIdRef = useRef(0)
  // Defaults to the player's own live rating, so doing nothing at all means
  // "match me automatically" — dragging it is an explicit, deliberate choice.
  const [targetKyu, setTargetKyu] = useState(rank.kyu)
  const [showStrength, setShowStrength] = useState(false)
  const [humanColor, setHumanColor] = useState(null)
  const aiColor = humanColor === 'black' ? 'white' : 'black'
  const [started, setStarted] = useState(false)
  const [openingMove, setOpeningMove] = useState(null)
  const [gameId, setGameId] = useState(null)
  const [moves, setMoves] = useState([])
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState(null)
  // Set when the server no longer knows this game (e.g. it restarted mid-game
  // — games live in memory only, see server/games.js). Distinct from a plain
  // `error`: the board can't recover on its own, so it needs its own screen
  // rather than a dead board sitting behind an inline error line.
  const [gameGone, setGameGone] = useState(false)
  const [result, setResult] = useState(null)
  const [ratingChange, setRatingChange] = useState(null)
  // Fetched once, silently, for the rating calc below — handed to GameReview
  // so opening "Review my mistakes" doesn't re-run the same GNU Go analysis.
  const [review, setReview] = useState(null)
  const [starting, setStarting] = useState(false)
  const [turn, setTurn] = useState('black')
  const [clocks, setClocks] = useState(null)
  const [remark, setRemark] = useState(null)
  const [hint, setHint] = useState(null)
  const [hintLoading, setHintLoading] = useState(false)
  // Whether the persistent post-game board or the separate mistake-review
  // screen is showing — see the `postGameView === 'review'` branch below.
  const [postGameView, setPostGameView] = useState('board')
  // True while the end-of-game territory blocks are still sweeping across
  // the board — the win/lose reveal waits for this to finish.
  const [scoring, setScoring] = useState(false)
  const [territoryMarks, setTerritoryMarks] = useState([])
  const [sweepMs, setSweepMs] = useState(COUNT_DURATION_MS)
  const engineRef = useRef(null)
  // Previous board state, so commentary can see what actually changed.
  const prevStateRef = useRef(null)
  // Move number the AI last spoke on, so idle chatter can space itself out.
  const lastRemarkMoveRef = useRef(null)
  // A finished game should only move the rating once, no matter how many
  // times `result` gets set on the way to being final.
  const rankUpdatedRef = useRef(false)

  // Release the server-side GNU Go process when leaving the screen.
  useEffect(() => {
    return () => {
      if (gameId) api.deleteGame(gameId).catch(() => {})
    }
  }, [gameId])

  // Only the player to move burns time. Ticking every 250ms rather than every
  // second keeps the display honest when a move lands mid-second.
  useEffect(() => {
    if (!clocks || result) return
    const started = Date.now()
    const from = clocks[turn]

    const id = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      setClocks((prev) => (prev ? { ...prev, [turn]: Math.max(0, from - elapsed) } : prev))
    }, 250)

    return () => clearInterval(id)
    // Restarting on every turn change is what makes the clock switch sides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, result, Boolean(clocks)])

  // Running out of time loses, the same as resigning. The clock is purely a
  // client-side concept, so unless the server is told, it never learns the
  // game ended — leaving it permanently "in progress" and unreviewable.
  useEffect(() => {
    if (!clocks || result) return
    const loser = clocks.black <= 0 ? 'black' : clocks.white <= 0 ? 'white' : null
    if (!loser) return
    const winner = loser === 'black' ? 'white' : 'black'
    setResult({
      winner,
      reason: 'timeout',
      detail: loser === humanColor ? 'You ran out of time' : 'Your opponent ran out of time',
    })
  }, [clocks, result])

  // Moves the rating exactly once per finished game, however it ended
  // (score, resignation, or timeout all funnel through `result`). Waits on
  // the review's performance data so a scrappy win doesn't move the rating
  // as much as a well-played one — see updateRatingAfterGame in rank.js.
  useEffect(() => {
    if (!result || rankUpdatedRef.current) return
    rankUpdatedRef.current = true

    let cancelled = false
    ;(async () => {
      // A timeout ends the game purely client-side (the clock) — the server
      // never hears about it otherwise, and /review 409s on a game it still
      // thinks is in progress. Tell it first, before asking for the review.
      if (result.reason === 'timeout') {
        const loser = result.winner === humanColor ? aiColor : humanColor
        await api.timeoutGame(gameId, loser).catch(() => {})
      }

      let averageLoss = null
      try {
        const reviewData = await api.reviewGame(gameId)
        if (!cancelled) setReview(reviewData)
        averageLoss = reviewData.performance?.averageLoss ?? null
      } catch {
        // Rating still updates on win/loss alone if this fails.
      }
      if (cancelled) return

      const next = updateRatingAfterGame(rank, {
        won: result.winner === humanColor,
        opponentKyu: targetKyu,
        averageLoss,
      })
      setRatingChange({ from: rank.kyu, to: next.kyu, delta: next.delta })
      onRankChange({
        kyu: next.kyu,
        gamesPlayed: next.gamesPlayed,
        source: rank.source,
        assessedAt: rank.assessedAt,
      })
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  // The territory-counting sweep: reads point-by-point ownership straight
  // from tenuki's own scorer (the same one result.score came from, so the
  // running count always lands exactly on the final number) and reveals it
  // across the board a few points at a time instead of the score just
  // appearing. Only applies to a scored ending — a resignation or timeout
  // has no territory to count, so the win/lose reveal shows immediately.
  useEffect(() => {
    if (!result || result.reason !== 'score') {
      setScoring(false)
      return
    }
    const board = engineRef.current
    const territory = board?.territory?.()
    const combined = territory
      ? [
          ...territory.black.map((p) => ({ ...p, color: 'black' })),
          ...territory.white.map((p) => ({ ...p, color: 'white' })),
        ].sort((a, b) => a.y - b.y || a.x - b.x)
      : []

    if (combined.length === 0) {
      setScoring(false)
      setTerritoryMarks([])
      return
    }

    const duration = Math.max(
      MIN_SWEEP_MS,
      Math.min(MAX_SWEEP_MS, combined.length * SWEEP_MS_PER_POINT),
    )
    const perPoint = duration / combined.length
    setTerritoryMarks(
      combined.map((p, i) => ({
        type: 'territory',
        y: p.y,
        x: p.x,
        tone: p.color,
        delayMs: Math.round(i * perPoint),
      })),
    )
    setSweepMs(duration)
    setScoring(true)
    // A little past the last block's own entrance transition, so the reveal
    // doesn't cut off mid-motion.
    const timer = setTimeout(() => setScoring(false), duration + 260)
    return () => clearTimeout(timer)
  }, [result])

  const isScored = Boolean(result?.score)
  const blackCount = useCountUp(isScored ? result.score.black : 0, {
    duration: sweepMs,
    active: isScored,
  })
  const whiteCount = useCountUp(isScored ? result.score.white : 0, {
    duration: sweepMs,
    active: isScored,
  })

  /**
   * Creates the game and begins. Takes the chosen format directly rather
   * than reading it back from state, since it's called in the same tap that
   * sets it — state wouldn't have committed yet.
   */
  const start = async (color, chosenFormat) => {
    setStarting(true)
    setError(null)
    setHumanColor(color)
    setFormat(chosenFormat)
    try {
      const game = await api.createGame({
        targetKyu,
        boardSize: chosenFormat.boardSize,
        humanColor: color,
        mode,
      })
      setGameId(game.id)
      setMoves(game.moves ?? [])
      // When the human takes white, the engine has already opened as black —
      // that move never passes through applyReply, so it needs its own note.
      setOpeningMove(game.firstMove ?? null)
      if (mode === 'teaching') addTeachingNote(noteForAiMove(game.firstMove, chosenFormat.boardSize))
      // Untimed formats pass no clocks, so the bars fall back to a turn badge.
      setClocks(
        chosenFormat.minutes
          ? { black: chosenFormat.minutes * 60, white: chosenFormat.minutes * 60 }
          : null,
      )
      setStarted(true)
    } catch (err) {
      setError(err.message)
      setHumanColor(null)
    } finally {
      setStarting(false)
    }
  }

  // One shared narrator voice for the whole chat log — a teaching game is one
  // pro sitting next to you talking through both sides, not a back-and-forth.
  const addTeachingNote = (text) => {
    if (!text) return
    teachingLogIdRef.current += 1
    setTeachingLog((log) => [...log, { id: teachingLogIdRef.current, text }])
  }

  /**
   * Mirror the engine's reply onto the local tenuki board.
   * `humanPoint` is the point the human just played, when this reply follows
   * a move (omitted after a pass) — passed through so the teaching notes can
   * reference where on the board something actually happened.
   */
  const applyReply = (board, payload, humanPoint = null) => {
    const { ai, game, quality } = payload
    setMoves(game?.moves ?? [])

    if (mode === 'teaching') {
      addTeachingNote(noteForHumanMove(quality, humanPoint, format.boardSize))
      addTeachingNote(noteForAiMove(ai, format.boardSize))
    }

    if (ai?.resign) {
      setResult({ winner: humanColor, reason: 'resignation', detail: 'Your opponent resigned' })
    } else if (ai?.pass) {
      board.pass()
    } else if (ai) {
      // The engine only answers in its own colour. If the local board
      // disagrees about whose turn it is, the two have diverged — surface that
      // rather than writing the stone in the wrong colour.
      if (board.currentPlayer() !== aiColor) {
        setError('The board fell out of sync with the server. Start a new game.')
        return
      }
      board.playAt(ai.y, ai.x)
    }

    if (game?.over && game.result) {
      const scored = game.result.reason === 'score'
      setResult({
        winner: game.result.winner,
        reason: game.result.reason,
        detail: scored ? game.result.score : undefined,
        // tenuki holds the local territory count; the server's margin is the
        // authority on who won, so show both rather than recomputing.
        score: scored ? board.score?.() : undefined,
      })
    }
  }

  const handleMove = async ({ game, state, playedPoint }) => {
    // The engine's own stones come back through this callback too. Passes are
    // driven by handlePass, which talks to the server itself — and a pass has
    // no played point, so it must never reach the move request below.
    if (state.pass || state.color !== humanColor || result) return

    setThinking(true)
    setError(null)
    try {
      const payload = await api.playMove(gameId, playedPoint.y, playedPoint.x)
      applyReply(game, payload, playedPoint)
    } catch (err) {
      game.undo()
      // The server (GNU Go) is authoritative on legality; if it refuses, roll
      // the local board back so the two can't drift apart.
      if (err.status === 422) {
        setError('That move is not legal.')
      } else if (err.status === 404) {
        setGameGone(true)
      } else {
        setError(err.message)
      }
    } finally {
      setThinking(false)
    }
  }

  const handlePass = async () => {
    const board = engineRef.current
    if (!board || thinking || result) return
    setThinking(true)
    try {
      board.pass()
      const payload = await api.passMove(gameId)
      applyReply(board, payload)
    } catch (err) {
      if (err.status === 404) setGameGone(true)
      else setError(err.message)
    } finally {
      setThinking(false)
    }
  }

  // A beginner stuck in a clearly lost game had no way out before this except
  // playing to the bitter end or abandoning the tab — resignation is a real,
  // hard-to-reverse action, so it's armed on a first tap and only actually
  // sent on a second confirming tap, rather than a native confirm() dialog
  // that would look out of place next to the rest of this screen.
  const [resignArmed, setResignArmed] = useState(false)
  const resignArmedTimer = useRef(null)
  const RESIGN_ARM_MS = 3000

  useEffect(() => () => clearTimeout(resignArmedTimer.current), [])

  const handleResign = async () => {
    if (!resignArmed) {
      setResignArmed(true)
      resignArmedTimer.current = setTimeout(() => setResignArmed(false), RESIGN_ARM_MS)
      return
    }
    clearTimeout(resignArmedTimer.current)
    setResignArmed(false)
    if (thinking || result) return
    setThinking(true)
    try {
      const payload = await api.resignGame(gameId)
      setResult({ winner: payload.game.result.winner, reason: 'resignation' })
    } catch (err) {
      if (err.status === 404) setGameGone(true)
      else setError(err.message)
    } finally {
      setThinking(false)
    }
  }

  const handleHint = async () => {
    if (!gameId || thinking || result || turn !== humanColor) return
    setHintLoading(true)
    setError(null)
    try {
      const data = await api.getHint(gameId)
      // Late in a game, the engine may have no candidate worth suggesting at
      // all — that's a real answer ("pass"), not nothing, so it still needs
      // to render something rather than silently clearing the hint.
      setHint(
        data.best
          ? { ...data.best, moveNumber: data.moveNumber }
          : { moveNumber: data.moveNumber, noMove: true },
      )
    } catch (err) {
      if (err.status === 404) setGameGone(true)
      else setError(err.message)
    } finally {
      setHintLoading(false)
    }
  }

  // A hint is only about the current position, so it clears once you move.
  useEffect(() => {
    setHint(null)
  }, [turn])

  const startQuickGame = (option) => {
    const color = Math.random() < 0.5 ? 'black' : 'white'
    start(color, option)
  }

  // Pre-game: one screen. Tapping a board size starts the game immediately —
  // opponent strength defaults to an automatic match against the player's
  // own live rating, and colour is assigned by a coin flip — but board size
  // and the Teaching game toggle are always a deliberate choice made here
  // first, never skipped.
  if (!started) {
    const opponentLevel = AI_LEVELS[aiLevelForKyu(targetKyu)]
    const isMatched = Math.abs(targetKyu - rank.kyu) < 0.05

    return (
      <LevelSelectScreen
        onBack={onExit}
        backLabel="← Home"
        // Plain-language only in this compact corner — "22 kyu" means
        // nothing to a beginner, and there's no room here for both the
        // label and the number (see the opponent panel below for that).
        progress={`${skillLabelForKyu(rank.kyu)} · vs ${opponentLevel.name}`}
      >
        <Logo size="md" className="screen-mark" />
        <h2>How long have you got?</h2>
        <div className="level-list">
          {FORMATS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="level-card"
              onClick={() => startQuickGame(option)}
              disabled={starting}
            >
              <span className="level-name">
                {option.name} · {option.boardSize}×{option.boardSize}
                {option.minutes ? ` · ${option.minutes} min` : ''}
              </span>
              <span className="level-blurb">{option.blurb}</span>
            </button>
          ))}
        </div>

        {/* Both settings, not choices — one shared card, one section-gap
            below the board list, so the screen reads as two decisions
            (which board; how to play it) instead of five flat, same-weight
            controls in a row. */}
        <div className="level-select-options">
          <label className="mode-toggle-row">
            <input
              type="checkbox"
              className="mode-toggle-input"
              checked={mode === 'teaching'}
              onChange={(e) => setMode(e.target.checked ? 'teaching' : 'play')}
            />
            <span className="mode-toggle-switch" aria-hidden="true" />
            <span className="mode-toggle-text">
              <span className="mode-toggle-name">Teaching game</span>
              <span className="mode-toggle-blurb">
                I'll talk through your moves and mine as we go, instead of staying quiet until the end.
              </span>
            </span>
          </label>

          <div className="strength-panel">
            <button
              type="button"
              className="link-button"
              onClick={() => setShowStrength((v) => !v)}
            >
              {/* Plain-language leads (opponentLevel.name is already one of the
                  app's own words — Gentle, Careless, Steady…), raw kyu trails
                  small in parens for anyone who already knows what it means.
                  What's actually decided reads at a glance, with no click
                  needed to understand it — expanding only reveals the slider
                  to change it. */}
              Opponent: {opponentLevel.name} ({formatRank(targetKyu)}){' '}
              {showStrength ? '▲' : '▾'}
            </button>
            {showStrength && (
              <div className="strength-picker">
                <input
                  type="range"
                  className="strength-slider"
                  min={-MAX_KYU}
                  max={-MIN_KYU}
                  step={0.5}
                  // Inverted so dragging right makes the opponent stronger,
                  // which reads more naturally than higher-kyu-is-weaker does.
                  value={-targetKyu}
                  onChange={(e) => setTargetKyu(-Number(e.target.value))}
                />
                <div className="strength-picker-readout">
                  <strong>{opponentLevel.name}</strong>
                  <span>
                    {formatRank(targetKyu)} — {opponentLevel.blurb.toLowerCase()}
                  </span>
                </div>
                {!isMatched && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setTargetKyu(rank.kyu)}
                  >
                    Match my level ({skillLabelForKyu(rank.kyu)})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {starting && (
          <p className="screen-feedback info">
            Setting up your game{humanColor ? ` as ${humanColor === 'black' ? 'Black' : 'White'}` : ''}…
          </p>
        )}
        {error && <p className="screen-feedback error">{error}</p>}
      </LevelSelectScreen>
    )
  }

  // Shared by a normal rematch and by recovering from a vanished game — both
  // just want back to the pre-game screen with a clean slate.
  const resetForNewGame = () => {
    setResult(null)
    setRatingChange(null)
    setReview(null)
    rankUpdatedRef.current = false
    setRemark(null)
    setTeachingLog([])
    clearTimeout(resignArmedTimer.current)
    setResignArmed(false)
    setError(null)
    setGameGone(false)
    setPostGameView('board')
    setScoring(false)
    setTerritoryMarks([])
    setStarted(false)
    setHumanColor(null)
    setGameId(null)
    setOpeningMove(null)
    setMoves([])
    prevStateRef.current = null
    lastRemarkMoveRef.current = null
  }

  // The server keeps games in memory only (see server/games.js) — a restart
  // (deploy, crash, free-tier idle spin-down) wipes them mid-game. When that
  // happens there's no way to keep playing, so this replaces the board
  // outright rather than leaving a dead position sitting behind an error line
  // with Hint/Pass buttons that would just fail the same way.
  if (gameGone) {
    return (
      <LevelSelectScreen onBack={onExit} backLabel="← Home">
        <Logo size="md" className="screen-mark" />
        <h2>This game ended unexpectedly</h2>
        <p className="level-select-note">
          The connection to it was lost, most likely because the server
          restarted. Nothing about your rating changed — start a new game
          to keep playing.
        </p>
        <button type="button" className="primary-button" onClick={resetForNewGame}>
          Start a new game
        </button>
      </LevelSelectScreen>
    )
  }

  // A separate screen for analysing the finished game, entered from the
  // "Review my mistakes" action below — it starts the GNU Go review right
  // away with its own loading state, rather than the persistent board
  // screen just growing a busy button.
  if (postGameView === 'review') {
    return (
      <GameReview
        gameId={gameId}
        moves={moves}
        precomputedReview={review}
        boardSize={format.boardSize}
        onBack={() => setPostGameView('board')}
        onHome={onExit}
        onRematch={resetForNewGame}
      />
    )
  }

  const footer = result ? (
    // The board above still shows the finished position (plus, for a scored
    // ending, the territory sweep) — the conclusion is a panel under it, not
    // a screen that replaces it.
    <div className={`game-over ${result.winner === humanColor ? 'won' : 'lost'}`}>
      <Logo size="md" className="game-over-mark" />

      {isScored && (
        <div className="game-over-score">
          <div className="game-over-score-side">
            <span className="game-over-score-label">Black</span>
            <span className="game-over-score-value">{blackCount}</span>
          </div>
          <div className="game-over-score-divider" />
          <div className="game-over-score-side">
            <span className="game-over-score-label">White</span>
            <span className="game-over-score-value">{whiteCount}</span>
          </div>
        </div>
      )}

      {scoring ? (
        <p className="screen-feedback info">Counting the board…</p>
      ) : (
        <>
          <div className={`game-over-stone ${result.winner} in`} aria-hidden="true" />
          <h1 className="game-over-headline in">
            {result.winner === humanColor ? 'You win' : 'You lose'}
          </h1>
          <p className="game-over-reason in">
            {result.winner === 'black' ? 'Black' : 'White'} wins {REASON_TEXT[result.reason] ?? ''}
            {result.detail ? ` · ${result.detail}` : ''}
          </p>
          {ratingChange && (
            <div className="game-over-rating in">
              <span className="game-over-rating-label">Rating</span>
              <span className="game-over-rating-value">
                {formatRank(ratingChange.from)} → {formatRank(ratingChange.to)}
              </span>
              <span className={`game-over-rating-delta ${ratingChange.delta > 0 ? 'up' : 'down'}`}>
                {ratingChange.delta > 0 ? '▲' : '▼'} {Math.abs(ratingChange.delta).toFixed(1)}
              </span>
              <span className="game-over-rating-tier">{skillLabelForKyu(ratingChange.to)}</span>
            </div>
          )}
          <div className="game-over-actions in">
            <button type="button" className="ghost-button" onClick={() => setPostGameView('review')}>
              Review my mistakes
            </button>
            <button type="button" className="primary-button" onClick={resetForNewGame}>
              Play again
            </button>
            <button type="button" className="ghost-button" onClick={onExit}>
              Home
            </button>
          </div>
        </>
      )}
    </div>
  ) : (
    <>
      {thinking && (
        <p className="screen-feedback info">
          {AI_LEVELS[aiLevelForKyu(targetKyu)].name} is thinking…
        </p>
      )}
      {error && <p className="screen-feedback error">{error}</p>}

      {hint && (
        <div className="hint-bar">
          <span className="hint-bar-label">Hint</span>
          <div className="hint-bar-body">
            <span className="hint-bar-why">
              {hint.noMove
                ? 'No move here is worth much anymore — this is a good place to pass.'
                : describeOpening(hint, format.boardSize, hint.moveNumber) ??
                  'Best move marked on the board.'}
            </span>
          </div>
        </div>
      )}

      {mode === 'teaching' ? (
        !thinking &&
        !error &&
        !hint &&
        teachingLog.length > 0 && (
          <div className="teaching-log" aria-live="polite">
            {teachingLog.slice(-4).map((entry) => (
              <p key={entry.id} className="opponent-remark">
                <span className="opponent-remark-who">{AI_LEVELS[aiLevelForKyu(targetKyu)].name}</span>
                {entry.text}
              </p>
            ))}
          </div>
        )
      ) : (
        !thinking &&
        !error &&
        !hint &&
        remark && (
          <p className="opponent-remark">
            <span className="opponent-remark-who">{AI_LEVELS[aiLevelForKyu(targetKyu)].name}</span>
            {remark}
          </p>
        )
      )}

      <div className="go-board-toolbar">
        <button
          type="button"
          className="hint"
          onClick={handleHint}
          disabled={thinking || hintLoading || turn !== humanColor}
        >
          <HintIcon />
          {hintLoading ? '…' : 'Hint'}
        </button>
        <button type="button" onClick={handlePass} disabled={thinking}>
          <PassIcon />
          Pass
        </button>
        <button
          type="button"
          className={`resign${resignArmed ? ' resign-armed' : ''}`}
          onClick={handleResign}
          disabled={thinking}
        >
          <ResignIcon />
          {resignArmed ? 'Confirm?' : 'Resign'}
        </button>
      </div>
    </>
  )

  return (
    <PlayScreen
      onBack={onExit}
      backLabel="← Home"
      progress={
        `${format.boardSize}×${format.boardSize} · ${AI_LEVELS[aiLevelForKyu(targetKyu)].name}` +
        (mode === 'teaching' ? ' · Teaching game' : '')
      }
      footer={footer}
    >
      <GoBoard
        boardSize={format.boardSize}
        clocks={clocks}
        // Once the game ends in a score, the hint mark hands off to the
        // territory sweep — the board stays exactly as played, no reset.
        marks={
          result
            ? territoryMarks
            : hint && !hint.noMove
              ? [{ type: 'circle', y: hint.y, x: hint.x, tone: 'accent' }]
              : []
        }
        players={{
          [humanColor]: 'You',
          [`${humanColor}Detail`]: `${humanColor === 'black' ? 'Black' : 'White'} · ${skillLabelForKyu(rank.kyu)}`,
          [aiColor]: AI_LEVELS[aiLevelForKyu(targetKyu)].name,
          [`${aiColor}Detail`]: `${aiColor === 'black' ? 'Black' : 'White'} · computer`,
        }}
        onMove={handleMove}
        onRender={({ game }) => {
          setTurn(game.currentPlayer())
          const state = game.currentState()
          const prev = prevStateRef.current
          if (mode !== 'teaching' && prev && state.moveNumber > prev.moveNumber) {
            const line = commentOn({
              prev,
              state,
              mover: state.color,
              human: humanColor,
              boardSize: format.boardSize,
              lastRemarkMove: lastRemarkMoveRef.current,
            })
            if (line) {
              setRemark(line)
              lastRemarkMoveRef.current = state.moveNumber
            }
          }
          prevStateRef.current = state
        }}
        onReady={(game) => {
          engineRef.current = game
          // If the human took white, the engine already opened as black on the
          // server; replay that stone onto the fresh local board.
          if (openingMove && !openingMove.pass && !openingMove.resign) {
            game.playAt(openingMove.y, openingMove.x)
          }
        }}
        locked={thinking || Boolean(result)}
      />
    </PlayScreen>
  )
}
