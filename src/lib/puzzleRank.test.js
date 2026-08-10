import { describe, expect, it } from 'vitest'
import { MIN_KYU, MAX_KYU } from './rank'
import { updatePuzzleRating, pickRound } from './puzzleRank'

describe('updatePuzzleRating', () => {
  it('improves (lowers) kyu on solving a puzzle at the player\'s own level', () => {
    const next = updatePuzzleRating({ kyu: 15, attempts: 10 }, { solved: true, puzzleDifficulty: 15 })
    expect(next.kyu).toBeLessThan(15)
    expect(next.attempts).toBe(11)
  })

  it('worsens (raises) kyu on missing a puzzle at the player\'s own level', () => {
    const next = updatePuzzleRating({ kyu: 15, attempts: 10 }, { solved: false, puzzleDifficulty: 15 })
    expect(next.kyu).toBeGreaterThan(15)
  })

  it('moves the rating less for solving an easy puzzle than an even one', () => {
    const vsEven = updatePuzzleRating({ kyu: 15, attempts: 20 }, { solved: true, puzzleDifficulty: 15 })
    const vsEasy = updatePuzzleRating({ kyu: 15, attempts: 20 }, { solved: true, puzzleDifficulty: 25 })
    expect(vsEasy.delta).toBeLessThan(vsEven.delta)
  })

  it('moves a fresh puzzle rating faster than a settled one', () => {
    const fresh = updatePuzzleRating({ kyu: 15, attempts: 0 }, { solved: true, puzzleDifficulty: 15 })
    const settled = updatePuzzleRating({ kyu: 15, attempts: 100 }, { solved: true, puzzleDifficulty: 15 })
    expect(fresh.delta).toBeGreaterThan(settled.delta)
  })

  it('never lets a single puzzle swing the rating past the hard cap', () => {
    const next = updatePuzzleRating({ kyu: 25, attempts: 0 }, { solved: true, puzzleDifficulty: MIN_KYU })
    expect(next.delta).toBeLessThanOrEqual(2)
  })

  it('clamps the resulting kyu to the documented range', () => {
    const atFloor = updatePuzzleRating({ kyu: MIN_KYU + 0.2, attempts: 0 }, { solved: true, puzzleDifficulty: MIN_KYU })
    expect(atFloor.kyu).toBeGreaterThanOrEqual(MIN_KYU)

    const atCeiling = updatePuzzleRating({ kyu: MAX_KYU - 0.2, attempts: 0 }, { solved: false, puzzleDifficulty: MAX_KYU })
    expect(atCeiling.kyu).toBeLessThanOrEqual(MAX_KYU)
  })
})

describe('pickRound', () => {
  const puzzles = [
    { id: 'a', difficulty: 27 },
    { id: 'b', difficulty: 24 },
    { id: 'c', difficulty: 20 },
    { id: 'd', difficulty: 16 },
    { id: 'e', difficulty: 12 },
    { id: 'f', difficulty: 9 },
  ]

  it('returns the requested round size', () => {
    const round = pickRound(puzzles, 20, 5)
    expect(round).toHaveLength(5)
  })

  it('draws only from puzzles closest to the player\'s rating, not the full bank', () => {
    // Furthest puzzle from kyu 20 is 'f' (difficulty 9, gap 11) — with a
    // round size of 2 (band = round*2 = 4 closest), it should never appear.
    for (let i = 0; i < 20; i += 1) {
      const round = pickRound(puzzles, 20, 2)
      expect(round.some((p) => p.id === 'f')).toBe(false)
    }
  })

  it('excludes recently-seen puzzles when enough fresh ones remain', () => {
    const round = pickRound(puzzles, 20, 3, ['c', 'd'])
    expect(round.some((p) => p.id === 'c' || p.id === 'd')).toBe(false)
  })

  it('falls back to the full bank once exclusions leave too few puzzles', () => {
    const almostAll = puzzles.slice(0, 5).map((p) => p.id)
    const round = pickRound(puzzles, 20, 5, almostAll)
    expect(round).toHaveLength(5)
  })
})
