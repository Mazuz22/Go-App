import { spawn } from 'node:child_process'

/**
 * Thin GTP (Go Text Protocol) wrapper around a GNU Go subprocess.
 *
 * GTP is line-based request/response over stdin/stdout. Every response is
 * terminated by a blank line and begins with `=` (success) or `?` (failure):
 *
 *     genmove white\n     ->     = E6\n\n
 *     play black Z9\n     ->     ? illegal move\n\n
 *
 * Responses come back strictly in request order, so pending promises are
 * matched FIFO.
 */

const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRST' // GTP skips "I"
const DEFAULT_TIMEOUT_MS = 15000

/** Board coords (y from top, x from left) -> GTP vertex, e.g. (3,4) -> "E6". */
export function toGtp(y, x, boardSize) {
  return `${GTP_LETTERS[x]}${boardSize - y}`
}

/** GTP vertex -> board coords, or a pass/resign marker. */
export function fromGtp(vertex, boardSize) {
  const v = String(vertex).trim().toUpperCase()
  if (v === 'PASS') return { pass: true }
  if (v === 'RESIGN') return { resign: true }

  const x = GTP_LETTERS.indexOf(v[0])
  const row = Number.parseInt(v.slice(1), 10)
  if (x < 0 || Number.isNaN(row)) {
    throw new Error(`Unparseable GTP vertex: ${vertex}`)
  }
  return { y: boardSize - row, x }
}

export class GtpEngine {
  constructor({ binary = 'gnugo', level = 1, boardSize = 9, komi = 6.5 } = {}) {
    this.boardSize = boardSize
    this.level = level
    this.komi = komi
    this.closed = false
    this._buffer = ''
    this._pending = []

    this.proc = spawn(binary, ['--mode', 'gtp', '--level', String(level)])

    this.proc.stdout.on('data', (chunk) => this._consume(chunk))
    this.proc.on('exit', (code) => this._failAll(new Error(`GNU Go exited (${code})`)))
    this.proc.on('error', (err) => this._failAll(err))
    // GNU Go chats on stderr; keep it off the app's console.
    this.proc.stderr.resume()
  }

  _consume(chunk) {
    this._buffer += chunk.toString()

    let split
    while ((split = this._buffer.indexOf('\n\n')) !== -1) {
      const raw = this._buffer.slice(0, split).trim()
      this._buffer = this._buffer.slice(split + 2)

      const waiter = this._pending.shift()
      if (!waiter) continue

      clearTimeout(waiter.timer)
      if (raw.startsWith('?')) {
        waiter.reject(new Error(raw.replace(/^\?\s*/, '') || 'GTP error'))
      } else {
        waiter.resolve(raw.replace(/^=\s*/, ''))
      }
    }
  }

  _failAll(err) {
    this.closed = true
    const waiting = this._pending.splice(0)
    waiting.forEach(({ reject, timer }) => {
      clearTimeout(timer)
      reject(err)
    })
  }

  send(command, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    if (this.closed) return Promise.reject(new Error('Engine is closed'))

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Drop the waiter so later responses don't shift onto the wrong promise.
        this._pending = this._pending.filter((p) => p.timer !== timer)
        reject(new Error(`GTP timed out: ${command}`))
      }, timeout)

      this._pending.push({ resolve, reject, timer })
      this.proc.stdin.write(`${command}\n`)
    })
  }

  /** Configure a fresh board. Must be called before play/genmove. */
  async start() {
    await this.send(`boardsize ${this.boardSize}`)
    await this.send('clear_board')
    await this.send(`komi ${this.komi}`)
    await this.send(`level ${this.level}`)
  }

  play(color, y, x) {
    return this.send(`play ${color} ${toGtp(y, x, this.boardSize)}`)
  }

  pass(color) {
    return this.send(`play ${color} pass`)
  }

  async genmove(color) {
    const vertex = await this.send(`genmove ${color}`)
    return fromGtp(vertex, this.boardSize)
  }

  /**
   * Place N handicap stones for black and return where they went.
   *
   * The engine is authoritative on placement: tenuki and GNU Go disagree about
   * the third stone on 9x9 (GNU Go C3/C7/G7, tenuki C3/G3/G7), so the client
   * mirrors these vertices rather than computing its own.
   */
  async fixedHandicap(count) {
    const response = await this.send(`fixed_handicap ${count}`)
    return response
      .split(/\s+/)
      .filter(Boolean)
      .map((vertex) => fromGtp(vertex, this.boardSize))
  }

  /**
   * Candidate moves GNU Go is considering, best first, e.g.
   * "F3 33.51 C6 33.51 C7 30.88 ...". Used to make the engine play *worse* on
   * purpose: choosing a lower-ranked candidate yields a plausible but inferior
   * move, which reads as a weaker opponent rather than a broken one.
   *
   * Unlike genmove, this only suggests — the caller must play the result.
   */
  async topMoves(color) {
    const response = await this.send(`top_moves_${color}`)
    const parts = response.split(/\s+/).filter(Boolean)
    const moves = []
    for (let i = 0; i < parts.length - 1; i += 2) {
      const value = Number.parseFloat(parts[i + 1])
      if (Number.isNaN(value)) break
      try {
        const point = fromGtp(parts[i], this.boardSize)
        if (!point.pass && !point.resign) moves.push({ ...point, value })
      } catch {
        break
      }
    }
    return moves
  }

  /** Final score as GNU Go reports it, e.g. "W+12.5". */
  finalScore() {
    return this.send('final_score')
  }

  async quit() {
    if (this.closed) return
    try {
      await this.send('quit', { timeout: 2000 })
    } catch {
      // Engine may already be gone; killing below is enough.
    }
    this.closed = true
    this.proc.kill()
  }
}
