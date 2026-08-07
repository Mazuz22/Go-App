import { useEffect, useId, useRef, useState } from 'react'
import { Game } from 'tenuki'
import Logo from './Logo'
import { applySetup } from '../lib/position'

const PLAYER_LABEL = { black: 'Black', white: 'White' }

/*
 * Overlay positioning is measured from the rendered board rather than computed
 * from tenuki's constants.
 *
 * Constants looked fine until coordinates were switched on: the gutter labels
 * make the board asymmetric (the first intersection sits at 12% across, but the
 * last at 77%, not 88%), so any 2*MARGIN formula lands marks off-grid. Reading
 * each intersection's real position keeps the crosshair and hints aligned for
 * any board size, with or without coordinates, whatever tenuki does internally.
 */

export default function GoBoard({
  boardSize = 9,
  setup = null,
  onMove = null,
  onReady = null,
  onRender = null,
  showStatus = true,
  marks = [],
  locked = false,
  komi = 0,
  clocks = null,
  players = null,
  coordinates = false,
}) {
  const wrapperRef = useRef(null)
  const boardRef = useRef(null)
  const gameRef = useRef(null)
  // Read inside tenuki's click hook, which is created once per game, so it has
  // to see the current value rather than the one captured at construction.
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const [status, setStatus] = useState({
    currentPlayer: 'black',
    blackPrisoners: 0,
    whitePrisoners: 0,
    moveNumber: 0,
    isOver: false,
  })
  const [hover, setHover] = useState(null)
  // Overlay positions are measured at render time, so a resize would leave them
  // stale — bump this to recompute when the board changes size.
  const [, bumpGeometry] = useState(0)

  useEffect(() => {
    const el = boardRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => bumpGeometry((n) => n + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const syncStatus = () => {
    const game = gameRef.current
    const state = game.currentState()
    setStatus({
      currentPlayer: game.currentPlayer(),
      // tenuki counts stones *lost*: blackStonesCaptured only increments when
      // White plays. So a player's prisoners are the opponent's lost stones.
      blackPrisoners: state.whiteStonesCaptured,
      whitePrisoners: state.blackStonesCaptured,
      moveNumber: state.moveNumber,
      isOver: game.isOver(),
    })
  }

  // tenuki re-renders on every state change, including our own reverts. Track
  // the move number so a lesson only reacts to genuinely new student moves.
  const lastReportedMove = useRef(0)

  const handleRender = () => {
    syncStatus()
    const game = gameRef.current
    if (!game) return

    // Fires on *every* render, including ones with no new move — e.g. marking
    // dead stones during scoring, which changes the score but not the move number.
    onRender?.({ game })

    if (!onMove) return
    const state = game.currentState()
    if (state.moveNumber > lastReportedMove.current) {
      lastReportedMove.current = state.moveNumber
      onMove({ game, state, playedPoint: state.playedPoint })
    } else {
      lastReportedMove.current = state.moveNumber
    }
  }

  const startNewGame = () => {
    if (boardRef.current) boardRef.current.innerHTML = ''

    // `_hooks` replaces tenuki's default click/hover handling. We reproduce the
    // defaults but gate them on `locked`, so the board can be made read-only
    // while the engine is thinking. The holder exists because the hooks are
    // built before the Game they refer to.
    const holder = {}
    const game = new Game({
      element: boardRef.current,
      boardSize,
      komi,
      _hooks: {
        handleClick(y, x) {
          const g = holder.game
          if (!g || lockedRef.current) return
          if (g.isOver()) g.toggleDeadAt(y, x)
          else g.playAt(y, x)
        },
        hoverValue(y, x) {
          const g = holder.game
          if (!g || lockedRef.current) return undefined
          if (!g.isOver() && !g.isIllegalAt(y, x)) return g.currentPlayer()
          return undefined
        },
        gameIsOver: () => holder.game?.isOver() ?? false,
      },
    })
    holder.game = game
    gameRef.current = game

    if (setup) applySetup(game, setup)
    // Assigned after setup so seeding the position doesn't fire onMove.
    game.callbacks.postRender = handleRender
    syncStatus()
    onReady?.(game)
  }

  useEffect(() => {
    startNewGame()

    return () => {
      if (gameRef.current) gameRef.current.callbacks.postRender = () => {}
      gameRef.current = null
      // tenuki appends its board markup into the container rather than
      // replacing it, so clear it manually (needed for StrictMode's
      // mount->unmount->remount in dev, which would otherwise stack boards).
      if (boardRef.current) boardRef.current.innerHTML = ''
    }
  }, [boardSize])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    // Targeting reticle: on a dense/small board, a fingertip covers the exact
    // intersection being aimed at. Track the nearest intersection under the
    // pointer via event delegation (works for both mouse hover and touch drag)
    // and draw guide lines through it so the row/column stay legible.
    const updateHover = (event) => {
      const el = event.target.closest?.('.intersection')
      if (!el) return
      setHover({
        y: Number(el.dataset.intersectionY),
        x: Number(el.dataset.intersectionX),
        empty: el.classList.contains('empty'),
      })
    }
    const clearHover = () => setHover(null)

    wrapper.addEventListener('pointermove', updateHover)
    wrapper.addEventListener('pointerdown', updateHover)
    wrapper.addEventListener('pointerup', clearHover)
    wrapper.addEventListener('pointercancel', clearHover)
    wrapper.addEventListener('pointerleave', clearHover)

    return () => {
      wrapper.removeEventListener('pointermove', updateHover)
      wrapper.removeEventListener('pointerdown', updateHover)
      wrapper.removeEventListener('pointerup', clearHover)
      wrapper.removeEventListener('pointercancel', clearHover)
      wrapper.removeEventListener('pointerleave', clearHover)
    }
  }, [boardSize])

  /** Where an intersection actually sits, as percentages of the board box. */
  const pointStyle = (y, x) => {
    const wrap = wrapperRef.current
    const el = boardRef.current?.querySelector(
      `[data-intersection-y="${y}"][data-intersection-x="${x}"]`,
    )
    if (!wrap || !el) return undefined
    const w = wrap.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!w.width || !r.width) return undefined
    return {
      '--x': `${((r.x + r.width / 2 - w.x) / w.width) * 100}%`,
      '--y': `${((r.y + r.height / 2 - w.y) / w.height) * 100}%`,
      // The intersection box is one stone wide, so this scales with the board.
      '--stone-size': `${(r.width / w.width) * 100}%`,
    }
  }

  const showReticle = hover && !status.isOver && !locked
  const reticleStyle = showReticle ? pointStyle(hover.y, hover.x) : undefined

  return (
    <div className="go-board-screen">
      {/* Bars are grouped with the board so they hug it as one unit rather
          than drifting to the extremes of the available height. */}
      <div className="game-area">
        {showStatus && (
          <div className="game-headline">
            <h1 className="game-title">
              <Logo size="sm" />
            </h1>
            <div className="game-subline">
              <span>
                {status.isOver
                  ? 'Game over'
                  : `Move ${status.moveNumber} · ${PLAYER_LABEL[status.currentPlayer]}'s turn`}
              </span>
              <span className="game-scoreline">
                W {status.whitePrisoners} · B {status.blackPrisoners}
              </span>
            </div>
          </div>
        )}

        {showStatus && (
          <div className="player-row">
            <PlayerSide
              color="black"
              name={players?.black ?? 'You'}
              detail={players?.blackDetail}
              active={!status.isOver && status.currentPlayer === 'black'}
              prisoners={status.blackPrisoners}
              seconds={clocks?.black}
            />
            <PlayerSide
              color="white"
              side="right"
              name={players?.white ?? 'Computer'}
              detail={players?.whiteDetail}
              active={!status.isOver && status.currentPlayer === 'white'}
              prisoners={status.whitePrisoners}
              seconds={clocks?.white}
            />
          </div>
        )}

        <div className="go-board-card">
          <div className="go-board-wrapper" ref={wrapperRef}>
            {/* No `tenuki-board-flat` class: tenuki then adds
                `tenuki-board-nonflat` itself, which turns on the stone
                gradients and drop shadows. It only affects stones — the
                board fill stays flat. */}
            <div
              ref={boardRef}
              className="tenuki-board"
              {...(coordinates ? { 'data-include-coordinates': 'true' } : {})}
            />

            {/* tenuki has no public API for arbitrary board marks, so they're
                drawn as an overlay using the same intersection geometry as
                the crosshair. Colour comes from `tone`, not from what's
                underneath, so it stays legible on stone, wood, or empty. */}
            {marks.map(({ type = 'triangle', y, x, tone }) => (
              <Mark
                key={`${y},${x}`}
                type={type}
                tone={tone}
                style={pointStyle(y, x)}
              />
            ))}

            {showReticle && (
              <div className="reticle" style={reticleStyle}>
                <div className="reticle-line horizontal" />
                <div className="reticle-line vertical" />
                <div className="reticle-tick tick-a" />
                <div className="reticle-tick tick-b" />
                {hover.empty && <div className={`ghost-stone ghost-${status.currentPlayer}`} />}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// Post-game review tones — a flat colour per move-quality tier, distinct
// from the live "accent" suggestion and the blue teaching-mark gradient.
const QUALITY_COLORS = {
  good: '#4ade80',
  inaccuracy: '#facc15',
  mistake: '#fb923c',
  blunder: '#f87171',
}

function Mark({ type, style, tone = 'auto' }) {
  // A suggestion is the app talking, so it takes the accent colour and gets a
  // halo — a thin dark ring on dark wood is close to invisible. Teaching marks
  // get their own blue gradient instead, readable on stone, wood, or empty
  // points alike. useId keeps each mark's <linearGradient> uniquely
  // addressable even with several marks on the board at once.
  const accent = tone === 'accent'
  const qualityColor = QUALITY_COLORS[tone]
  const gradientId = useId()
  const stroke = accent ? 'var(--accent-strong)' : (qualityColor ?? `url(#${gradientId})`)

  return (
    <svg
      className={`board-mark${accent ? ' board-mark-accent' : ''}`}
      style={style}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {!accent && !qualityColor && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="var(--reticle)" />
            <stop offset="100%" stopColor="#0c4a6e" />
          </linearGradient>
        </defs>
      )}
      {accent && (
        <>
          {/* Soft disc behind the ring so it reads on wood as well as on stones. */}
          <circle cx="50" cy="50" r="44" fill="var(--accent)" opacity="0.22" />
          <circle className="board-mark-pulse" cx="50" cy="50" r="34" fill="none"
                  stroke="var(--accent-strong)" strokeWidth="5" opacity="0.55" />
        </>
      )}
      {type === 'triangle' && (
        <polygon
          points="50,16 86,80 14,80"
          fill="none"
          stroke={stroke}
          strokeWidth="11"
          strokeLinejoin="round"
        />
      )}
      {type === 'circle' && (
        <circle cx="50" cy="50" r="31" fill="none" stroke={stroke} strokeWidth={accent ? 12 : 11} />
      )}
      {type === 'square' && (
        <rect x="20" y="20" width="60" height="60" fill="none" stroke={stroke} strokeWidth="11" />
      )}
    </svg>
  )
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(seconds))
  const mins = Math.floor(safe / 60)
  return `${mins}:${String(safe % 60).padStart(2, '0')}`
}

function PlayerSide({ color, side = 'left', name, detail, active, prisoners, seconds }) {
  const hasClock = typeof seconds === 'number'
  const low = hasClock && seconds <= 30

  return (
    <div className={`player-side ${side}${active ? ' active' : ''}`}>
      <span className={`player-avatar player-${color}`} />
      <span className="player-meta">
        <span className="player-name">{name}</span>
        <span className="player-sub">
          {detail ?? `${PLAYER_LABEL[color]} · Captures: ${prisoners}`}
        </span>
      </span>
      {hasClock && (
        <span className={`player-clock${active ? ' running' : ''}${low ? ' low' : ''}`}>
          {formatClock(seconds)}
        </span>
      )}
    </div>
  )
}
