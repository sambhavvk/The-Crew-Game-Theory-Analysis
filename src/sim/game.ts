import { SeededRandom } from './random'
import type {
  Card,
  GameConfig,
  GameResult,
  InternalGameState,
  MissionTask,
  Play,
  PlayerView,
  StrategyAgent,
  Suit,
} from './types'

const COLOR_SUITS: Suit[] = ['pink', 'green', 'blue', 'yellow']

export function createDeck(): Card[] {
  const cards = COLOR_SUITS.flatMap((suit) =>
    Array.from({ length: 9 }, (_, index) => ({ id: `${suit}-${index + 1}`, suit, rank: index + 1 })),
  )
  cards.push(...Array.from({ length: 4 }, (_, index) => ({ id: `rocket-${index + 1}`, suit: 'rocket' as const, rank: index + 1 })))
  return cards
}

export function legalCards(hand: Card[], currentTrick: Play[]): Card[] {
  if (currentTrick.length === 0) return [...hand]
  const leadSuit = currentTrick[0].card.suit
  const following = hand.filter((card) => card.suit === leadSuit)
  return following.length > 0 ? following : [...hand]
}

export function winningPlay(plays: Play[]): Play {
  const rockets = plays.filter((play) => play.card.suit === 'rocket')
  if (rockets.length > 0) return rockets.reduce((best, play) => (play.card.rank > best.card.rank ? play : best))
  const leadSuit = plays[0].card.suit
  return plays
    .filter((play) => play.card.suit === leadSuit)
    .reduce((best, play) => (play.card.rank > best.card.rank ? play : best))
}

export function cloneTasks(tasks: MissionTask[]): MissionTask[] {
  return tasks.map((task) => ({ ...task, card: { ...task.card } }))
}

export function playerView(state: InternalGameState, seat: number): PlayerView {
  return {
    seat,
    hand: [...state.hands[seat]],
    handCounts: state.hands.map((hand) => hand.length),
    leader: state.leader,
    commander: state.commander,
    currentTrick: state.currentTrick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    history: state.history,
    tasks: cloneTasks(state.tasks),
    trickNumber: state.history.length,
  }
}

export function resolveTrick(state: InternalGameState): number {
  const winner = winningPlay(state.currentTrick).seat
  const taskIds: string[] = []
  for (const task of state.tasks) {
    if (task.status !== 'pending') continue
    if (state.currentTrick.some((play) => play.card.id === task.card.id)) {
      task.status = winner === task.target ? 'won' : 'lost'
      task.resolvedTrick = state.history.length
      taskIds.push(task.id)
    }
  }
  state.history.push({
    index: state.history.length,
    leader: state.leader,
    plays: state.currentTrick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    winner,
    taskIds,
  })
  state.currentTrick = []
  state.leader = winner
  return winner
}

export function initialState(seed: number, taskCount: number): InternalGameState {
  const rng = new SeededRandom(seed)
  const deck = rng.shuffle(createDeck())
  const hands = Array.from({ length: 4 }, (_, seat) => deck.slice(seat * 10, seat * 10 + 10))
  const commander = hands.findIndex((hand) => hand.some((card) => card.id === 'rocket-4'))
  const taskCards = rng.shuffle(deck.filter((card) => card.suit !== 'rocket')).slice(0, taskCount)
  const tasks = taskCards.map((card, index) => ({
    id: `T${index + 1}`,
    card: { ...card },
    target: (commander + index + 1 + rng.int(3)) % 4,
    status: 'pending' as const,
  }))
  return { hands, leader: commander, commander, currentTrick: [], history: [], tasks }
}

function removeCard(hand: Card[], card: Card): void {
  const index = hand.findIndex((candidate) => candidate.id === card.id)
  if (index < 0) throw new Error(`Agent selected unavailable card ${card.id}`)
  hand.splice(index, 1)
}

export function playGame(config: GameConfig, agent: StrategyAgent): GameResult {
  const rng = new SeededRandom(config.seed ^ 0xa5a5a5a5)
  const state = initialState(config.seed, config.taskCount)
  let nodes = 0
  agent.reset?.()

  while (
    state.history.length < 10
    && !state.tasks.some((task) => task.status === 'lost')
    && state.tasks.some((task) => task.status === 'pending')
  ) {
    const trickLeader = state.leader
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (trickLeader + offset) % 4
      const view = playerView(state, seat)
      const decision = agent.choose(view, rng.fork(state.history.length * 17 + seat * 31 + offset))
      const legal = legalCards(state.hands[seat], state.currentTrick)
      if (!legal.some((card) => card.id === decision.card.id)) {
        throw new Error(`${agent.name} made illegal play ${decision.card.id}`)
      }
      removeCard(state.hands[seat], decision.card)
      state.currentTrick.push({ seat, card: { ...decision.card } })
      nodes += decision.nodes ?? 1
    }
    resolveTrick(state)
  }

  const tasksWon = state.tasks.filter((task) => task.status === 'won').length
  const success = tasksWon === state.tasks.length
  const rocketsSpent = state.history
    .flatMap((trick) => trick.plays)
    .filter((play) => play.card.suit === 'rocket' && play.card.rank < 4).length
  const taskFraction = tasksWon / Math.max(1, state.tasks.length)
  const rocketConservation = (3 - rocketsSpent) / 3
  const score = Math.round((success ? 70 : 0) + taskFraction * 25 + Math.max(0, rocketConservation) * 5)
  agent.observeResult?.(score / 100)

  return {
    seed: config.seed,
    strategyId: config.strategyId,
    success,
    score,
    tasksWon,
    taskCount: state.tasks.length,
    rocketsSpent,
    nodes,
    commander: state.commander,
    tasks: cloneTasks(state.tasks),
    history: config.recordTrace === false ? [] : state.history,
  }
}
