export const SUITS = ['pink', 'green', 'blue', 'yellow', 'rocket'] as const
export type Suit = (typeof SUITS)[number]

export interface Card {
  id: string
  suit: Suit
  rank: number
}

export interface Play {
  seat: number
  card: Card
}

export interface TrickRecord {
  index: number
  leader: number
  plays: Play[]
  winner: number
  taskIds: string[]
}

export type TaskStatus = 'pending' | 'won' | 'lost'

export interface MissionTask {
  id: string
  card: Card
  target: number
  status: TaskStatus
  resolvedTrick?: number
}

export interface PlayerView {
  seat: number
  hand: Card[]
  handCounts: number[]
  leader: number
  commander: number
  currentTrick: Play[]
  history: TrickRecord[]
  tasks: MissionTask[]
  trickNumber: number
}

export interface InternalGameState {
  hands: Card[][]
  leader: number
  commander: number
  currentTrick: Play[]
  history: TrickRecord[]
  tasks: MissionTask[]
}

export interface AgentDecision {
  card: Card
  nodes?: number
}

export interface StrategyAgent {
  readonly id: StrategyId
  readonly name: string
  choose(view: PlayerView, rng: RandomSource): AgentDecision
  reset?(): void
  observeResult?(score: number): void
  setTraining?(training: boolean): void
}

export interface RandomSource {
  next(): number
  int(max: number): number
  shuffle<T>(values: T[]): T[]
  fork(salt: number): RandomSource
}

export type StrategyId = 'random' | 'greedy' | 'void' | 'qlearn' | 'ismcts'

export interface GameConfig {
  seed: number
  taskCount: number
  strategyId: StrategyId
  mctsRollouts: number
  training?: boolean
  recordTrace?: boolean
}

export interface GameResult {
  seed: number
  strategyId: StrategyId
  success: boolean
  score: number
  tasksWon: number
  taskCount: number
  rocketsSpent: number
  nodes: number
  commander: number
  tasks: MissionTask[]
  history: TrickRecord[]
}

export interface AgentSummary {
  id: StrategyId
  name: string
  shortName: string
  family: string
  description: string
  successRate: number
  avgScore: number
  taskRate: number
  rocketConservation: number
  avgNodes: number
  rating: number
  wins: number
  bestGame: GameResult
  scores: number[]
}

export interface PairwiseCell {
  row: StrategyId
  col: StrategyId
  winRate: number
  ties: number
}

export interface TournamentConfig {
  games: number
  taskCount: number
  mctsRollouts: number
  trainingEpisodes: number
  baseSeed: number
}

export interface TournamentResult {
  config: TournamentConfig
  summaries: AgentSummary[]
  pairwise: PairwiseCell[]
  bestAgent: AgentSummary
  bestGame: GameResult
  totalGames: number
  elapsedMs: number
  insights: string[]
}

export const STRATEGY_META: Record<StrategyId, Pick<AgentSummary, 'name' | 'shortName' | 'family' | 'description'>> = {
  random: {
    name: 'Telemetry Noise',
    shortName: 'Random',
    family: 'Stochastic baseline',
    description: 'Samples uniformly from legal cards. It measures how much coordination the smarter systems add.',
  },
  greedy: {
    name: 'Vector Chaser',
    shortName: 'Greedy',
    family: 'Local search',
    description: 'Wins cheaply when possible and sheds low cards, without planning around mission objectives.',
  },
  void: {
    name: 'Void Architect',
    shortName: 'Heuristic',
    family: 'Rule-based planner',
    description: 'Protects task cards, creates useful voids, and hands tricks to the assigned specialist.',
  },
  qlearn: {
    name: 'Echo Learner',
    shortName: 'Q-learning',
    family: 'Reinforcement learning',
    description: 'A tabular Monte Carlo learner trained by self-play on abstracted public game states.',
  },
  ismcts: {
    name: 'Horizon Search',
    shortName: 'IS-MCTS',
    family: 'Information-set search',
    description: 'Samples hidden hands and rolls each legal play forward to estimate cooperative mission value.',
  },
}
