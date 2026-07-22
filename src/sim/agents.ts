import { cloneTasks, createDeck, legalCards, playerView, resolveTrick, winningPlay } from './game'
import type {
  Card,
  InternalGameState,
  MissionTask,
  PlayerView,
  RandomSource,
  StrategyAgent,
  StrategyId,
} from './types'
import { STRATEGY_META } from './types'

function rankAscending(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => (a.suit === 'rocket' ? 20 : a.rank) - (b.suit === 'rocket' ? 20 : b.rank))
}

function currentWinner(view: PlayerView, card?: Card): number | null {
  const plays = card ? [...view.currentTrick, { seat: view.seat, card }] : view.currentTrick
  return plays.length > 0 ? winningPlay(plays).seat : null
}

function relatedTask(card: Card, tasks: MissionTask[]): MissionTask | undefined {
  return tasks.find((task) => task.status === 'pending' && task.card.id === card.id)
}

function missionCardScore(card: Card, view: PlayerView): number {
  const legal = legalCards(view.hand, view.currentTrick)
  const task = relatedTask(card, view.tasks)
  const cardInTrick = view.currentTrick
    .map((play) => view.tasks.find((candidate) => candidate.status === 'pending' && candidate.card.id === play.card.id))
    .find(Boolean)
  const winnerBefore = currentWinner(view)
  const winnerAfter = currentWinner(view, card)
  const wins = winnerAfter === view.seat
  let score = card.rank

  if (card.suit === 'rocket') score += 16 + card.rank * 2
  if (task) {
    score += task.target === view.seat ? 20 : 44
    if (view.currentTrick.length === 0 && task.target === view.seat) score -= 12
  }

  if (cardInTrick) {
    if (cardInTrick.target === view.seat) score += wins ? -48 : 36
    else if (winnerBefore === cardInTrick.target && !wins) score -= 42
    else if (wins) score += 40
  }

  if (view.currentTrick.length === 0) {
    const suitSize = view.hand.filter((candidate) => candidate.suit === card.suit).length
    score += suitSize * 1.8
  }

  if (legal.length === 1) score = 0
  return score
}

function missionChoice(view: PlayerView, rng: RandomSource, noise = 0): Card {
  const legal = legalCards(view.hand, view.currentTrick)
  return legal.reduce((best, card) => {
    const bestScore = missionCardScore(best, view) + rng.next() * noise
    const cardScore = missionCardScore(card, view) + rng.next() * noise
    return cardScore < bestScore ? card : best
  })
}

class RandomAgent implements StrategyAgent {
  readonly id = 'random' as const
  readonly name = STRATEGY_META.random.name

  choose(view: PlayerView, rng: RandomSource) {
    const legal = legalCards(view.hand, view.currentTrick)
    return { card: legal[rng.int(legal.length)] }
  }
}

class GreedyAgent implements StrategyAgent {
  readonly id = 'greedy' as const
  readonly name = STRATEGY_META.greedy.name

  choose(view: PlayerView) {
    const legal = rankAscending(legalCards(view.hand, view.currentTrick))
    if (view.currentTrick.length === 0) return { card: legal[0] }
    const winners = legal.filter((card) => currentWinner(view, card) === view.seat)
    return { card: winners[0] ?? legal[0] }
  }
}

class VoidAgent implements StrategyAgent {
  readonly id = 'void' as const
  readonly name = STRATEGY_META.void.name

  choose(view: PlayerView, rng: RandomSource) {
    return { card: missionChoice(view, rng, 0.01) }
  }
}

interface QDecision {
  state: string
  action: string
}

function stateKey(view: PlayerView): string {
  const liveTasks = view.tasks.filter((task) => task.status === 'pending')
  const ownTask = liveTasks.some((task) => task.target === view.seat)
  const taskInTrick = view.currentTrick
    .map((play) => liveTasks.find((task) => task.card.id === play.card.id))
    .find(Boolean)
  const lead = view.currentTrick[0]?.card.suit ?? 'lead'
  const winner = currentWinner(view)
  const winnerRole = winner == null ? 'none' : taskInTrick?.target === winner ? 'target' : winner === view.seat ? 'self' : 'other'
  return [Math.floor(view.trickNumber / 3), liveTasks.length, ownTask ? 1 : 0, taskInTrick?.target === view.seat ? 'mine' : taskInTrick ? 'theirs' : 'none', lead, winnerRole].join('|')
}

function actionKey(card: Card, view: PlayerView): string {
  const rankBand = card.rank <= 3 ? 'lo' : card.rank <= 6 ? 'mid' : 'hi'
  const task = relatedTask(card, view.tasks)
  const wins = currentWinner(view, card) === view.seat
  return [card.suit === 'rocket' ? 'rocket' : 'color', rankBand, task?.target === view.seat ? 'ownTask' : task ? 'otherTask' : 'plain', wins ? 'win' : 'duck'].join('|')
}

class QLearningAgent implements StrategyAgent {
  readonly id = 'qlearn' as const
  readonly name = STRATEGY_META.qlearn.name
  private q = new Map<string, number>()
  private trajectory: QDecision[] = []
  private training = false
  private visits = 0

  setTraining(training: boolean): void {
    this.training = training
  }

  reset(): void {
    this.trajectory = []
  }

  choose(view: PlayerView, rng: RandomSource) {
    const legal = legalCards(view.hand, view.currentTrick)
    const state = stateKey(view)
    const epsilon = this.training ? Math.max(0.06, 0.32 * Math.exp(-this.visits / 9000)) : 0
    let card: Card
    if (rng.next() < epsilon) {
      card = legal[rng.int(legal.length)]
    } else {
      card = legal.reduce((best, candidate) => {
        const bestQ = (this.q.get(`${state}::${actionKey(best, view)}`) ?? 0) - missionCardScore(best, view) / 180
        const candidateQ = (this.q.get(`${state}::${actionKey(candidate, view)}`) ?? 0) - missionCardScore(candidate, view) / 180
        return candidateQ > bestQ ? candidate : best
      })
    }
    this.trajectory.push({ state, action: actionKey(card, view) })
    this.visits += 1
    return { card }
  }

  observeResult(reward: number): void {
    if (!this.training) return
    const alpha = 0.12
    const lateWeightStart = Math.max(1, this.trajectory.length)
    this.trajectory.forEach((decision, index) => {
      const key = `${decision.state}::${decision.action}`
      const old = this.q.get(key) ?? 0
      const shapedReward = reward * (0.72 + 0.28 * (index / lateWeightStart))
      this.q.set(key, old + alpha * (shapedReward - old))
    })
  }
}

function determinize(view: PlayerView, rng: RandomSource): InternalGameState {
  const known = new Set([
    ...view.hand.map((card) => card.id),
    ...view.currentTrick.map((play) => play.card.id),
    ...view.history.flatMap((trick) => trick.plays.map((play) => play.card.id)),
  ])
  const pool = rng.shuffle(createDeck().filter((card) => !known.has(card.id)))
  const hands: Card[][] = Array.from({ length: 4 }, () => [])
  hands[view.seat] = view.hand.map((card) => ({ ...card }))
  let cursor = 0
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === view.seat) continue
    hands[seat] = pool.slice(cursor, cursor + view.handCounts[seat])
    cursor += view.handCounts[seat]
  }
  return {
    hands,
    leader: view.leader,
    commander: view.commander,
    currentTrick: view.currentTrick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    history: view.history.map((trick) => ({ ...trick, plays: trick.plays.map((play) => ({ seat: play.seat, card: { ...play.card } })) })),
    tasks: cloneTasks(view.tasks),
  }
}

function removeById(hand: Card[], card: Card): void {
  const index = hand.findIndex((candidate) => candidate.id === card.id)
  if (index >= 0) hand.splice(index, 1)
}

function rolloutMission(state: InternalGameState, rng: RandomSource): number {
  while (
    state.history.length < 10
    && !state.tasks.some((task) => task.status === 'lost')
    && state.tasks.some((task) => task.status === 'pending')
  ) {
    const startOffset = state.currentTrick.length
    const leader = state.leader
    for (let offset = startOffset; offset < 4; offset += 1) {
      const seat = (leader + offset) % 4
      const view = playerView(state, seat)
      const card = rng.next() < 0.82 ? missionChoice(view, rng, 0.08) : legalCards(view.hand, view.currentTrick)[rng.int(legalCards(view.hand, view.currentTrick).length)]
      removeById(state.hands[seat], card)
      state.currentTrick.push({ seat, card })
    }
    resolveTrick(state)
  }
  const won = state.tasks.filter((task) => task.status === 'won').length
  const failed = state.tasks.filter((task) => task.status === 'lost').length
  return won === state.tasks.length ? 1 : won / Math.max(1, state.tasks.length) * 0.55 - failed * 0.04
}

class ISMCTSAgent implements StrategyAgent {
  readonly id = 'ismcts' as const
  readonly name = STRATEGY_META.ismcts.name

  constructor(private readonly rollouts: number) {}

  choose(view: PlayerView, rng: RandomSource) {
    const legal = legalCards(view.hand, view.currentTrick)
    if (legal.length === 1) return { card: legal[0], nodes: 1 }
    const perCard = Math.max(2, Math.floor(this.rollouts / legal.length))
    let nodes = 0
    const values = legal.map((card, cardIndex) => {
      let value = 0
      for (let rollout = 0; rollout < perCard; rollout += 1) {
        const branchRng = rng.fork(cardIndex * 101 + rollout * 977)
        const state = determinize(view, branchRng)
        removeById(state.hands[view.seat], card)
        state.currentTrick.push({ seat: view.seat, card: { ...card } })
        value += rolloutMission(state, branchRng)
        nodes += 1
      }
      return value / perCard - missionCardScore(card, view) * 0.0005
    })
    const bestIndex = values.reduce((best, value, index) => (value > values[best] ? index : best), 0)
    return { card: legal[bestIndex], nodes }
  }
}

export function createAgent(id: StrategyId, mctsRollouts: number, qAgent?: QLearningAgent): StrategyAgent {
  switch (id) {
    case 'random': return new RandomAgent()
    case 'greedy': return new GreedyAgent()
    case 'void': return new VoidAgent()
    case 'qlearn': return qAgent ?? new QLearningAgent()
    case 'ismcts': return new ISMCTSAgent(mctsRollouts)
  }
}

export function createLearningAgent(): QLearningAgent {
  return new QLearningAgent()
}
