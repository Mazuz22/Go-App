import { useEffect, useRef, useState } from 'react'
import GoBoard from './GoBoard'
import GameOver from './GameOver'
import Logo from './Logo'
import Nigiri from './Nigiri'
import { HintIcon, PassIcon } from './icons'
import * as api from '../lib/api'
import { commentOn } from '../lib/commentary'
import { describeOpening } from '../lib/coords'
import { formatRank, AI_LEVELS, aiLevelForKyu, updateRatingAfterGame, MIN_KYU, MAX_KYU } from '../lib/rank'

// No handicap: every game starts from an empty board and the engine is
// weakened by how it plays (see server/games.js), not by stones given away.
// Colours come from nigiri, so the human is not always black.

/**
 * Board size is really a choice about how long you want to sit down for, so
 * it's presented that way. Only the full board is played on a clock — the
 * smaller boards are untimed so a beginner can think as long as they like.
 * Clock time is each player's own main time and, as in chess, only the player
 * to move burns it. Running out loses the game.
 */
const FORMATS = [
  { id: 'quick', name: 'Quick', minutes: null, boardSize: 9, blurb: '9×9 — a full game over a coffee. No clock.' },
  { id: 'medium', name: 'Medium', minutes: null, boardSize: 13, blurb: '13×13 — room to make shape. No clock.' },
  { id: 'full', name: 'Full', minutes: 45, boardSize: 19, blurb: '19×19 — the real board, on a 45 minute clock.' },
]

export default function PlayAI({ onExit, rank, onRankChange }) {
  // Pre-game order: choose the board, then the opponent's exact strength,
  // then decide colours by nigiri, then the game is created — the ritual
  // belongs immediately before play begins.
  const [format, setFormat] = useState(null)
  // Defaults to the player's own live rating, so doing nothing at all means
  // "match me automatically" — dragging it is an explicit, deliberate choice.
  const [targetKyu, setTargetKyu] = useState(rank.kyu)
  const [strengthConfirmed, setStrengthConfirmed] = useState(false)
  const [humanColor, setHumanColor] = useState(null)
  const aiColor = humanColor === 'black' ? 'white' : 'black'
  const [started, setStarted] = useState(false)
  const [openingMove, setOpeningMove] = useState(null)
  const [gameId, setGameId] = useState(null)
  const [moves, setMoves] = useState([])
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [ratingChange, setRatingChange] = useState(null)
  // Fetched once, silently, for the rating calc above — handed to GameOver
  // so "Review my mistakes" doesn't re-run the same GNU Go analysis.
  const [review, setReview] = useState(null)
  const [starting, setStarting] = useState(false)
  const [turn, setTurn] = useState('black')
  const [clocks, setClocks] = useState(null)
  const [remark, setRemark] = useState(null)
  const [hint, setHint] = useState(null)
  const [hintLoading, setHintLoading] = useState(false)
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

  /** Called once nigiri has settled colours; creates the game and begins. */
  const start = async (color) => {
    setStarting(true)
    setError(null)
    setHumanColor(color)
    try {
      const game = await api.createGame({
        targetKyu,
        boardSize: format.boardSize,
        humanColor: color,
      })
      setGameId(game.id)
      setMoves(game.moves ?? [])
      // When the human takes white, the engine has already opened as black.
      setOpeningMove(game.firstMove ?? null)
      // Untimed formats pass no clocks, so the bars fall back to a turn badge.
      setClocks(
        format.minutes
          ? { black: format.minutes * 60, white: format.minutes * 60 }
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

  /** Mirror the engine's reply onto the local tenuki board. */
  const applyReply = (board, payload) => {
    const { ai, game } = payload
    setMoves(game?.moves ?? [])

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
      applyReply(game, payload)
    } catch (err) {
      // The server (GNU Go) is authoritative on legality; if it refuses, roll
      // the local board back so the two can't drift apart.
      if (err.status === 422) {
        game.undo()
        setError('That move is not legal.')
      } else {
        game.undo()
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
      setError(err.message)
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
      setError(err.message)
    } finally {
      setHintLoading(false)
    }
  }

  // A hint is only about the current position, so it clears once you move.
  useEffect(() => {
    setHint(null)
  }, [turn])


  // Step 1: pick the board.
  if (!format) {
    return (
      <div className="level-select">
        <header className="tutorial-header">
          <button type="button" className="link-button" onClick={onExit}>
            ← Home
          </button>
          <span className="tutorial-progress">
            {formatRank(rank.kyu)} · vs {AI_LEVELS[aiLevelForKyu(targetKyu)].name}
          </span>
        </header>
        <div className="level-select-body stagger">
          <Logo size="md" className="screen-mark" />
          <h2>How long have you got?</h2>
          <p className="level-select-note">
            A bigger board is a longer game. The full board is played on a
            clock; the smaller ones are untimed.
          </p>
          <div className="level-list">
            {FORMATS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="level-card"
                onClick={() => setFormat(option)}
              >
                <span className="level-name">
                  {option.name}
                  {option.minutes ? ` · ${option.minutes} min` : ''}
                </span>
                <span className="level-blurb">{option.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Step 2: pick the opponent's exact strength, defaulting to an automatic
  // match against the player's own live rating.
  if (!strengthConfirmed) {
    const opponentLevel = AI_LEVELS[aiLevelForKyu(targetKyu)]
    const isMatched = Math.abs(targetKyu - rank.kyu) < 0.05

    return (
      <div className="level-select">
        <header className="tutorial-header">
          <button type="button" className="link-button" onClick={() => setFormat(null)}>
            ← Back
          </button>
          <span className="tutorial-progress">
            {format.name} · {format.boardSize}×{format.boardSize}
          </span>
        </header>
        <div className="level-select-body stagger">
          <Logo size="md" className="screen-mark" />
          <h2>How strong should your opponent be?</h2>
          <p className="level-select-note">
            Left alone, this matches your current rating automatically. Drag
            it to play someone deliberately stronger or weaker.
          </p>
          <div className="strength-picker">
            <input
              type="range"
              className="strength-slider"
              min={-MAX_KYU}
              max={-MIN_KYU}
              step={0.5}
              // Inverted so dragging right makes the opponent stronger, which
              // reads more naturally than higher-kyu-number-is-weaker does.
              value={-targetKyu}
              onChange={(e) => setTargetKyu(-Number(e.target.value))}
            />
            <div className="strength-picker-readout">
              <strong>{formatRank(targetKyu)}</strong>
              <span>
                {opponentLevel.name} — {opponentLevel.blurb.toLowerCase()}
              </span>
            </div>
            {!isMatched && (
              <button
                type="button"
                className="link-button"
                onClick={() => setTargetKyu(rank.kyu)}
              >
                Match my level ({formatRank(rank.kyu)})
              </button>
            )}
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => setStrengthConfirmed(true)}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // Step 3: decide colours, immediately before play.
  if (!started) {
    return (
      <>
        <Nigiri
          boardLabel={`${format.name} · ${format.boardSize}×${format.boardSize}`}
          busy={starting}
          onDecided={start}
          onCancel={() => setFormat(null)}
        />
        {error && (
          <p className="tutorial-feedback error nigiri-error">{error}</p>
        )}
      </>
    )
  }

  // Step 4: the game is over — it gets the whole screen, so a result (a
  // resignation especially) can't be missed under the board.
  if (result) {
    return (
      <GameOver
        result={result}
        humanColor={humanColor}
        // The server-side game is kept alive until this screen is left, so the
        // review can replay it.
        gameId={gameId}
        moves={moves}
        ratingChange={ratingChange}
        precomputedReview={review}
        boardSize={format.boardSize}
        onHome={onExit}
        onRematch={() => {
          setResult(null)
          setRatingChange(null)
          setReview(null)
          rankUpdatedRef.current = false
          setRemark(null)
          setError(null)
          setStarted(false)
          setHumanColor(null)
          setGameId(null)
          setOpeningMove(null)
          setMoves([])
          prevStateRef.current = null
          lastRemarkMoveRef.current = null
        }}
      />
    )
  }

  return (
    <div className="play-ai">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Home
        </button>
        <span className="tutorial-progress">
          {format.boardSize}×{format.boardSize} · {AI_LEVELS[aiLevelForKyu(targetKyu)].name}
        </span>
      </header>

      <GoBoard
        boardSize={format.boardSize}
        clocks={clocks}
        marks={hint && !hint.noMove ? [{ type: 'circle', y: hint.y, x: hint.x, tone: 'accent' }] : []}
        players={{
          [humanColor]: 'You',
          [`${humanColor}Detail`]: `${humanColor === 'black' ? 'Black' : 'White'} · ${formatRank(rank.kyu)}`,
          [aiColor]: AI_LEVELS[aiLevelForKyu(targetKyu)].name,
          [`${aiColor}Detail`]: `${aiColor === 'black' ? 'Black' : 'White'} · computer`,
        }}
        onMove={handleMove}
        onRender={({ game }) => {
          setTurn(game.currentPlayer())
          const state = game.currentState()
          const prev = prevStateRef.current
          if (prev && state.moveNumber > prev.moveNumber) {
            const line = commentOn({
              prev,
              state,
              mover: state.color,
              human: humanColor,
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

      <div className="tutorial-footer">
        {thinking && (
          <p className="tutorial-feedback info">
            {AI_LEVELS[aiLevelForKyu(targetKyu)].name} is thinking…
          </p>
        )}
        {error && <p className="tutorial-feedback error">{error}</p>}

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

        {!thinking && !error && !hint && remark && (
          <p className="opponent-remark">
            <span className="opponent-remark-who">{AI_LEVELS[aiLevelForKyu(targetKyu)].name}</span>
            {remark}
          </p>
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
        </div>
      </div>
    </div>
  )
}
