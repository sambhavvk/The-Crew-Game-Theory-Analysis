import { describe, expect, it } from 'vitest'
import { SeededRandom } from './random'
import { createAgent } from './agents'
import { createDeck, initialState, legalCards, playGame, winningPlay } from './game'

describe('The Crew simulation core', () => {
  it('builds the 40-card mission deck', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(40)
    expect(new Set(deck.map((card) => card.id)).size).toBe(40)
  })

  it('deals every card and identifies the commander', () => {
    const state = initialState(42, 3)
    expect(state.hands.flat()).toHaveLength(40)
    expect(state.hands[state.commander].some((card) => card.id === 'rocket-4')).toBe(true)
    expect(state.tasks).toHaveLength(3)
  })

  it('enforces following suit', () => {
    const hand = [
      { id: 'blue-2', suit: 'blue' as const, rank: 2 },
      { id: 'pink-8', suit: 'pink' as const, rank: 8 },
    ]
    const legal = legalCards(hand, [{ seat: 0, card: { id: 'blue-7', suit: 'blue', rank: 7 } }])
    expect(legal.map((card) => card.id)).toEqual(['blue-2'])
  })

  it('lets rockets trump the lead suit', () => {
    const winner = winningPlay([
      { seat: 0, card: { id: 'pink-9', suit: 'pink', rank: 9 } },
      { seat: 1, card: { id: 'rocket-1', suit: 'rocket', rank: 1 } },
      { seat: 2, card: { id: 'pink-1', suit: 'pink', rank: 1 } },
    ])
    expect(winner.seat).toBe(1)
  })

  it('plays complete, legal deterministic games for every strategy', () => {
    const ids = ['random', 'greedy', 'void', 'qlearn', 'ismcts'] as const
    for (const id of ids) {
      const agent = createAgent(id, 8)
      const result = playGame({ seed: 7, taskCount: 2, strategyId: id, mctsRollouts: 8 }, agent)
      expect(result.history.length).toBeGreaterThan(0)
      expect(result.history.length).toBeLessThanOrEqual(10)
      expect(result.history.every((trick) => trick.plays.length === 4)).toBe(true)
      expect(result.tasksWon).toBeGreaterThanOrEqual(0)
    }
  })

  it('produces repeatable random streams', () => {
    const a = new SeededRandom(123)
    const b = new SeededRandom(123)
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()))
  })
})
