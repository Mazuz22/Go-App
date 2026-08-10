import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { difficultyForKyu, tierForLoss, parseEstimate, runExclusive, MIN_KYU, MAX_KYU } from './games.js'

describe('parseEstimate', () => {
  it('reads black\'s advantage as a positive number', () => {
    assert.equal(parseEstimate('B+5'), 5)
  })

  it('reads white\'s advantage as a negative number', () => {
    assert.equal(parseEstimate('W+10.3'), -10.3)
  })

  it('ignores trailing GTP commentary', () => {
    assert.equal(parseEstimate('W+10.3 (upper bound: 12.1)'), -10.3)
  })

  it('falls back to 0 for unparseable input', () => {
    assert.equal(parseEstimate('garbage'), 0)
    assert.equal(parseEstimate(''), 0)
  })
})

describe('tierForLoss', () => {
  it('classifies at the documented thresholds', () => {
    assert.equal(tierForLoss(0), 'good')
    assert.equal(tierForLoss(0.9), 'good')
    assert.equal(tierForLoss(1), 'inaccuracy')
    assert.equal(tierForLoss(2.9), 'inaccuracy')
    assert.equal(tierForLoss(3), 'mistake')
    assert.equal(tierForLoss(5.9), 'mistake')
    assert.equal(tierForLoss(6), 'blunder')
    assert.equal(tierForLoss(20), 'blunder')
  })
})

describe('difficultyForKyu', () => {
  it('clamps below the strongest anchor to the strongest anchor\'s values', () => {
    assert.deepEqual(difficultyForKyu(MIN_KYU), { mistakeChance: 0, mistakeDepth: 1 })
    assert.deepEqual(difficultyForKyu(0), { mistakeChance: 0, mistakeDepth: 1 })
  })

  it('clamps above the weakest anchor to the weakest anchor\'s values', () => {
    assert.deepEqual(difficultyForKyu(MAX_KYU), { mistakeChance: 0.85, mistakeDepth: 10 })
  })

  it('linearly interpolates between adjacent anchors', () => {
    // Halfway between the 5-kyu and 10-kyu anchors.
    const mid = difficultyForKyu(7.5)
    assert.equal(mid.mistakeChance, 0.1)
    assert.equal(mid.mistakeDepth, 2.5)
  })

  it('gets weaker (higher mistakeChance) as kyu increases', () => {
    const stronger = difficultyForKyu(8)
    const weaker = difficultyForKyu(20)
    assert.ok(weaker.mistakeChance > stronger.mistakeChance)
  })
})

describe('runExclusive', () => {
  it('runs a single call and returns its result', async () => {
    const game = {}
    const result = await runExclusive(game, async () => 42)
    assert.equal(result, 42)
  })

  it('serializes overlapping calls on the same game in call order', async () => {
    const game = {}
    const order = []
    const first = runExclusive(game, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('first')
    })
    const second = runExclusive(game, async () => {
      order.push('second')
    })
    await Promise.all([first, second])
    assert.deepEqual(order, ['first', 'second'])
  })

  it('keeps the queue alive after a call throws', async () => {
    const game = {}
    await assert.rejects(runExclusive(game, async () => {
      throw new Error('boom')
    }))
    // A later call must still run rather than hang behind the failed one.
    const result = await runExclusive(game, async () => 'still works')
    assert.equal(result, 'still works')
  })

  it('does not serialize calls across different games', async () => {
    const gameA = {}
    const gameB = {}
    const order = []
    const slow = runExclusive(gameA, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('slow')
    })
    const fast = runExclusive(gameB, async () => {
      order.push('fast')
    })
    await Promise.all([slow, fast])
    assert.deepEqual(order, ['fast', 'slow'])
  })
})
