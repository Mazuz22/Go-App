import { describe, expect, it } from 'vitest'
import {
  MIN_KYU,
  MAX_KYU,
  kyuFromScore,
  aiLevelForKyu,
  updateRatingAfterGame,
  formatRank,
  skillLabelForKyu,
} from './rank'

describe('kyuFromScore', () => {
  it('returns the weakest anchor for zero attempts', () => {
    expect(kyuFromScore(0, 0)).toBe(25)
  })

  it('returns the weakest anchor for a perfect-zero score', () => {
    expect(kyuFromScore(0, 5)).toBe(25)
  })

  it('returns the strongest anchor for a perfect score', () => {
    expect(kyuFromScore(5, 5)).toBe(8)
  })

  it('lands on an interior anchor for a mid score', () => {
    expect(kyuFromScore(3, 5)).toBe(15)
  })
})

describe('aiLevelForKyu', () => {
  it('buckets a complete beginner as level 1', () => {
    expect(aiLevelForKyu(25)).toBe(1)
  })

  it('buckets dan-level strength as level 5', () => {
    expect(aiLevelForKyu(-3)).toBe(5)
  })

  it('is monotonic across the bucket boundaries', () => {
    expect(aiLevelForKyu(20)).toBe(1)
    expect(aiLevelForKyu(19)).toBe(2)
    expect(aiLevelForKyu(16)).toBe(2)
    expect(aiLevelForKyu(15)).toBe(3)
    expect(aiLevelForKyu(12)).toBe(3)
    expect(aiLevelForKyu(11)).toBe(4)
    expect(aiLevelForKyu(9)).toBe(4)
    expect(aiLevelForKyu(8)).toBe(5)
  })
})

describe('updateRatingAfterGame', () => {
  it('improves (lowers) kyu on a win against an even opponent', () => {
    const next = updateRatingAfterGame({ kyu: 15, gamesPlayed: 10 }, { won: true, opponentKyu: 15 })
    expect(next.kyu).toBeLessThan(15)
    expect(next.delta).toBeGreaterThan(0)
    expect(next.gamesPlayed).toBe(11)
  })

  it('worsens (raises) kyu on a loss against an even opponent', () => {
    const next = updateRatingAfterGame({ kyu: 15, gamesPlayed: 10 }, { won: false, opponentKyu: 15 })
    expect(next.kyu).toBeGreaterThan(15)
    expect(next.delta).toBeLessThan(0)
  })

  it('moves the rating less for beating a much weaker opponent than an even one', () => {
    const vsEven = updateRatingAfterGame({ kyu: 15, gamesPlayed: 20 }, { won: true, opponentKyu: 15 })
    const vsWeak = updateRatingAfterGame({ kyu: 15, gamesPlayed: 20 }, { won: true, opponentKyu: 25 })
    expect(vsWeak.delta).toBeLessThan(vsEven.delta)
  })

  it('scales the delta up for a well-played win and down for a scrappy one', () => {
    const clean = updateRatingAfterGame(
      { kyu: 15, gamesPlayed: 20 },
      { won: true, opponentKyu: 15, averageLoss: 0 },
    )
    const scrappy = updateRatingAfterGame(
      { kyu: 15, gamesPlayed: 20 },
      { won: true, opponentKyu: 15, averageLoss: 10 },
    )
    expect(clean.delta).toBeGreaterThan(scrappy.delta)
  })

  it('treats a missing averageLoss as neutral, not best-case', () => {
    const neutral = updateRatingAfterGame(
      { kyu: 15, gamesPlayed: 20 },
      { won: true, opponentKyu: 15, averageLoss: null },
    )
    const clean = updateRatingAfterGame(
      { kyu: 15, gamesPlayed: 20 },
      { won: true, opponentKyu: 15, averageLoss: 0 },
    )
    expect(neutral.delta).toBeLessThan(clean.delta)
  })

  it('moves a provisional (few games) rating faster than an established one', () => {
    const provisional = updateRatingAfterGame({ kyu: 15, gamesPlayed: 0 }, { won: true, opponentKyu: 15 })
    const established = updateRatingAfterGame({ kyu: 15, gamesPlayed: 100 }, { won: true, opponentKyu: 15 })
    expect(provisional.delta).toBeGreaterThan(established.delta)
  })

  it('never lets a single game swing the rating past the hard cap', () => {
    // Beating a far stronger opponent with a perfect game, at a provisional
    // rating — the most favorable case for the delta — should still be capped.
    const next = updateRatingAfterGame(
      { kyu: 25, gamesPlayed: 0 },
      { won: true, opponentKyu: -9, averageLoss: 0 },
    )
    expect(next.delta).toBeLessThanOrEqual(3)
  })

  it('clamps the resulting kyu to the documented range', () => {
    const atFloor = updateRatingAfterGame(
      { kyu: MIN_KYU + 0.5, gamesPlayed: 0 },
      { won: true, opponentKyu: MIN_KYU, averageLoss: 0 },
    )
    expect(atFloor.kyu).toBeGreaterThanOrEqual(MIN_KYU)

    const atCeiling = updateRatingAfterGame(
      { kyu: MAX_KYU - 0.5, gamesPlayed: 0 },
      { won: false, opponentKyu: MAX_KYU, averageLoss: 0 },
    )
    expect(atCeiling.kyu).toBeLessThanOrEqual(MAX_KYU)
  })
})

describe('formatRank', () => {
  it('formats kyu ranks as "N kyu"', () => {
    expect(formatRank(18)).toBe('18 kyu')
    expect(formatRank(1)).toBe('1 kyu')
  })

  it('formats dan ranks as "N dan", with 0 kyu reading as 1 dan', () => {
    expect(formatRank(0)).toBe('1 dan')
    expect(formatRank(-3)).toBe('4 dan')
  })

  it('rounds fractional kyu before formatting', () => {
    expect(formatRank(17.6)).toBe('18 kyu')
  })
})

describe('skillLabelForKyu', () => {
  it('covers the full kyu/dan range with a label', () => {
    expect(skillLabelForKyu(25)).toBe('Just starting out')
    expect(skillLabelForKyu(18)).toBe('Learning the basics')
    expect(skillLabelForKyu(14)).toBe('Getting comfortable')
    expect(skillLabelForKyu(10)).toBe('Building real skill')
    expect(skillLabelForKyu(3)).toBe('Strong player')
    expect(skillLabelForKyu(-2)).toBe('Advanced — dan level')
  })
})
