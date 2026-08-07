import Anthropic from '@anthropic-ai/sdk'
import { toGtp } from './gtp.js'

/**
 * Natural-language coaching over the review the engine already computed.
 *
 * GNU Go supplies the ground truth (which moves cost points, and how many —
 * see reviewGame() in games.js). Claude's job is only to narrate *why*, from
 * the actual moves played, in language a beginner can use. It is not asked to
 * invent Go knowledge or re-derive tactics no one gave it — the position is
 * described only as far as the real move list goes.
 */

const MODEL = 'claude-opus-4-8'

// Constructed lazily so a missing API key only breaks the coach endpoint, not
// server startup — this feature is optional, the game itself isn't.
let client = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

/** Numbered move list up to (not including) `uptoMove`, e.g. "1. B E5  2. W C3". */
function transcript(moves, boardSize, uptoMove) {
  return moves
    .slice(0, uptoMove)
    .map((m, i) => {
      const color = m.color === 'black' ? 'B' : 'W'
      const where = m.pass ? 'pass' : m.resign ? 'resign' : toGtp(m.y, m.x, boardSize)
      return `${i + 1}. ${color} ${where}`
    })
    .join('  ')
}

const SYSTEM_PROMPT = [
  'You are a patient Go teacher helping a beginner understand a game they just finished.',
  "You're given, for each flagged move, the moves played so far and how many points the engine's",
  'score estimate says that move cost. Write one short paragraph (2-3 plain sentences) per mistake,',
  'explaining what idea the player likely missed — e.g. corner or side priority, an urgent atari,',
  'a weak group needing help, or territory left open — grounded in the actual moves given.',
  "You aren't shown a live board, so stay at the level of strategic idea rather than claiming an exact",
  'tactical refutation you cannot verify from the move list alone. Do not restate the point total or use',
  'jargon without explaining it. Reply with exactly one paragraph per mistake, in the same order, each',
  'separated by a blank line. No headers, no move numbers, no markdown.',
].join(' ')

/**
 * @param moves     the full game's move list (see games.js `game.moves`)
 * @param mistakes  flagged blunders from reviewGame(), [{moveNumber, y, x, lost}]
 * @returns [{moveNumber, note}], one per mistake, in the same order
 */
export async function explainMistakes({ boardSize, humanColor, moves, mistakes }) {
  if (mistakes.length === 0) return []

  const prompt = mistakes
    .map((m) => {
      const before = transcript(moves, boardSize, m.moveNumber - 1)
      const played = toGtp(m.y, m.x, boardSize)
      return (
        `Mistake at move ${m.moveNumber}: ${humanColor} played ${played}, costing about ` +
        `${m.lost} points by the engine's estimate. Moves so far: ${before || '(opening move)'}`
      )
    })
    .join('\n\n')

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'medium' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('The coach declined to comment on this game.')
  }

  const text = response.content.find((b) => b.type === 'text')?.text ?? ''
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  // Pair positionally. If the model didn't return exactly one paragraph per
  // mistake, fall back to one shared note rather than mis-attributing text.
  return paragraphs.length === mistakes.length
    ? mistakes.map((m, i) => ({ moveNumber: m.moveNumber, note: paragraphs[i] }))
    : mistakes.map((m) => ({ moveNumber: m.moveNumber, note: paragraphs.join(' ') }))
}
