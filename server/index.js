import 'dotenv/config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import {
  createGame,
  chooseEngineMove,
  destroyGame,
  getGame,
  judgeHumanMoveAfter,
  judgeHumanMoveBefore,
  reviewGame,
  runExclusive,
  serialize,
  shutdown,
  MIN_KYU,
  MAX_KYU,
} from './games.js'
import { explainMistakes, explainPuzzleMiss } from './coach.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3001

/** Wrap async handlers so rejections become 500s instead of hanging. */
const route = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`${req.method} ${req.path} failed:`, err.message)
    if (!res.headersSent) res.status(500).json({ error: err.message })
  })
}

/** Load a game or send 404/409. Returns null when it has already responded. */
function requireGame(req, res, { mustBeLive = true } = {}) {
  const game = getGame(req.params.id)
  if (!game) {
    res.status(404).json({ error: 'Game not found' })
    return null
  }
  if (mustBeLive && game.over) {
    res.status(409).json({ error: 'Game is already over' })
    return null
  }
  return game
}

/**
 * Ask the engine for its reply and fold the outcome into the game.
 * Handles the two non-move answers GNU Go can give: pass and resign.
 */
async function playEngineReply(game) {
  const reply = await chooseEngineMove(game, game.aiColor)

  if (reply.resign) {
    game.over = true
    game.result = { winner: game.humanColor, reason: 'resignation' }
    game.moves.push({ color: game.aiColor, resign: true })
    return reply
  }

  if (reply.pass) {
    game.consecutivePasses += 1
    game.moves.push({ color: game.aiColor, pass: true })
  } else {
    game.consecutivePasses = 0
    game.moves.push({ color: game.aiColor, y: reply.y, x: reply.x })
  }

  if (game.consecutivePasses >= 2) await finish(game)
  return reply
}

/** Two passes end the game; ask GNU Go to score it. */
async function finish(game) {
  game.over = true
  const score = await game.engine.finalScore() // e.g. "W+12.5"
  const [side, margin] = score.split('+')
  game.result = {
    winner: side?.toUpperCase() === 'B' ? 'black' : 'white',
    margin: Number.parseFloat(margin),
    score,
    reason: 'score',
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post(
  '/api/games',
  route(async (req, res) => {
    const { targetKyu = 20, boardSize = 9, humanColor = 'black', mode = 'play' } = req.body ?? {}
    if (typeof targetKyu !== 'number' || Number.isNaN(targetKyu)) {
      return res.status(400).json({ error: 'targetKyu must be a number' })
    }
    if (targetKyu < MIN_KYU || targetKyu > MAX_KYU) {
      return res.status(400).json({ error: `targetKyu must be ${MIN_KYU}-${MAX_KYU}` })
    }
    if (humanColor !== 'black' && humanColor !== 'white') {
      return res.status(400).json({ error: 'humanColor must be black or white' })
    }
    if (mode !== 'play' && mode !== 'teaching') {
      return res.status(400).json({ error: 'mode must be play or teaching' })
    }

    // Always an even game now: difficulty comes from how the engine plays,
    // not from stones on the board before anyone has moved.
    const game = await createGame({ targetKyu, boardSize, humanColor, mode })

    // Black always moves first, so when the human takes white the engine opens.
    const firstMove = game.aiColor === 'black' ? await playEngineReply(game) : null

    res.status(201).json({ ...serialize(game), firstMove })
  }),
)

app.get(
  '/api/games/:id',
  route((req, res) => {
    const game = requireGame(req, res, { mustBeLive: false })
    if (game) res.json(serialize(game))
  }),
)

app.post(
  '/api/games/:id/move',
  route(async (req, res) => {
    const game = requireGame(req, res)
    if (!game) return

    const { y, x } = req.body ?? {}
    if (!Number.isInteger(y) || !Number.isInteger(x)) {
      return res.status(400).json({ error: 'y and x must be integers' })
    }
    if (y < 0 || x < 0 || y >= game.boardSize || x >= game.boardSize) {
      return res.status(400).json({ error: 'Move is off the board' })
    }

    // A move can chain several GTP round-trips (topMoves, estimate_score,
    // play, estimate_score again in Teaching mode) — runExclusive keeps an
    // overlapping request for the same game from interleaving into this one.
    await runExclusive(game, async () => {
      // Teaching Game mode grades the move live. The "before" half has to run
      // ahead of the move itself — it needs the position as it stood beforehand.
      const judging = game.mode === 'teaching' ? await judgeHumanMoveBefore(game) : null

      try {
        await game.engine.play(game.humanColor, y, x)
      } catch (err) {
        // GNU Go rejects illegal moves (occupied, suicide, ko).
        res.status(422).json({ error: err.message || 'Illegal move' })
        return
      }

      const quality = judging ? await judgeHumanMoveAfter(game, judging, y, x) : null

      game.consecutivePasses = 0
      game.moves.push({ color: game.humanColor, y, x })

      const reply = await playEngineReply(game)
      res.json({ ai: reply, game: serialize(game), quality })
    })
  }),
)

app.post(
  '/api/games/:id/pass',
  route(async (req, res) => {
    const game = requireGame(req, res)
    if (!game) return

    await runExclusive(game, async () => {
      await game.engine.pass(game.humanColor)
      game.consecutivePasses += 1
      game.moves.push({ color: game.humanColor, pass: true })

      if (game.consecutivePasses >= 2) {
        await finish(game)
        res.json({ ai: null, game: serialize(game) })
        return
      }

      const reply = await playEngineReply(game)
      res.json({ ai: reply, game: serialize(game) })
    })
  }),
)

app.get(
  '/api/games/:id/hint',
  route(async (req, res) => {
    const game = requireGame(req, res)
    if (!game) return

    await runExclusive(game, async () => {
      // The engine's own ranked candidates for the player's colour.
      const candidates = await game.engine.topMoves(game.humanColor)
      res.json({
        color: game.humanColor,
        moveNumber: game.moves.length,
        best: candidates[0] ?? null,
        alternatives: candidates.slice(1, 3),
      })
    })
  }),
)

app.post(
  '/api/games/:id/review',
  route(async (req, res) => {
    const game = requireGame(req, res, { mustBeLive: false })
    if (!game) return
    if (!game.over) {
      return res.status(409).json({ error: 'Game is still in progress' })
    }
    res.json(await reviewGame(game))
  }),
)

app.post(
  '/api/games/:id/coach',
  route(async (req, res) => {
    const game = requireGame(req, res, { mustBeLive: false })
    if (!game) return
    if (!game.over) {
      return res.status(409).json({ error: 'Game is still in progress' })
    }

    const { mistakes } = req.body ?? {}
    if (!Array.isArray(mistakes)) {
      return res.status(400).json({ error: 'mistakes must be an array' })
    }
    // This is a public endpoint that feeds straight into a GTP coordinate
    // string and a Claude prompt, so validate shape before either sees it —
    // capped well above the 3 entries a legitimate client ever sends.
    if (mistakes.length > 10) {
      return res.status(400).json({ error: 'mistakes must have at most 10 entries' })
    }
    const isValidMistake = (m) =>
      m &&
      Number.isInteger(m.moveNumber) &&
      m.moveNumber > 0 &&
      Number.isInteger(m.y) &&
      m.y >= 0 &&
      m.y < game.boardSize &&
      Number.isInteger(m.x) &&
      m.x >= 0 &&
      m.x < game.boardSize &&
      Number.isFinite(m.lost)
    if (!mistakes.every(isValidMistake)) {
      return res.status(400).json({ error: 'each mistake needs a valid moveNumber, y, x, and lost' })
    }

    const notes = await explainMistakes({
      boardSize: game.boardSize,
      humanColor: game.humanColor,
      moves: game.moves,
      mistakes,
    })
    res.json({ notes })
  }),
)

// Puzzles are static client-side data (src/puzzles.js) with no server-tracked
// game, so this endpoint takes the position directly rather than a game id —
// same trust boundary as /coach above (feeds straight into a Claude prompt),
// so it gets the same shape of validation.
app.post(
  '/api/puzzles/explain',
  route(async (req, res) => {
    const { boardSize, stones, prompt, playedColor, playedPoint } = req.body ?? {}

    if (!Number.isInteger(boardSize) || boardSize < 5 || boardSize > 19) {
      return res.status(400).json({ error: 'boardSize must be an integer 5-19' })
    }
    const onBoard = (n) => Number.isInteger(n) && n >= 0 && n < boardSize
    const isValidStone = (s) => s && (s.color === 'black' || s.color === 'white') && onBoard(s.y) && onBoard(s.x)
    if (!Array.isArray(stones) || stones.length === 0 || stones.length > 60 || !stones.every(isValidStone)) {
      return res.status(400).json({ error: 'stones must be a non-empty array of valid {color, y, x}' })
    }
    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 300) {
      return res.status(400).json({ error: 'prompt must be a string up to 300 characters' })
    }
    if (playedColor !== 'black' && playedColor !== 'white') {
      return res.status(400).json({ error: 'playedColor must be black or white' })
    }
    if (!playedPoint || !onBoard(playedPoint.y) || !onBoard(playedPoint.x)) {
      return res.status(400).json({ error: 'playedPoint must be a valid {y, x} on the board' })
    }

    const note = await explainPuzzleMiss({ boardSize, stones, prompt, playedColor, playedPoint })
    res.json({ note })
  }),
)

app.post(
  '/api/games/:id/resign',
  route(async (req, res) => {
    const game = requireGame(req, res)
    if (!game) return

    game.over = true
    game.result = { winner: game.aiColor, reason: 'resignation' }
    res.json({ game: serialize(game) })
  }),
)

// The clock is a purely client-side concept — the server has no idea a
// player ran out of time until told, so without this a timeout-ended game
// stays "in progress" forever server-side and can never be reviewed.
app.post(
  '/api/games/:id/timeout',
  route(async (req, res) => {
    const game = requireGame(req, res)
    if (!game) return

    const { loser } = req.body ?? {}
    if (loser !== 'black' && loser !== 'white') {
      return res.status(400).json({ error: 'loser must be black or white' })
    }

    game.over = true
    game.result = { winner: loser === 'black' ? 'white' : 'black', reason: 'timeout' }
    res.json({ game: serialize(game) })
  }),
)

app.delete(
  '/api/games/:id',
  route(async (req, res) => {
    const existed = await destroyGame(req.params.id)
    res.status(existed ? 204 : 404).end()
  }),
)

// Single-service deploy: when a built frontend sits next to the server (see
// the Dockerfile), serve it directly instead of standing up a second static
// host. In local dev there's no dist/ yet — Vite's own dev server handles
// the frontend then, and this whole block is a no-op.
const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  // Anything that isn't an API route is a client-side route — hand it the
  // SPA shell and let React Router-less `App.jsx` sort out the screen.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  console.log(`Go server listening on http://localhost:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close()
    await shutdown()
    process.exit(0)
  })
}
