import { createAgent, createLearningAgent } from './agents'
import { playGame } from './game'
import type {
  AgentSummary,
  GameResult,
  PairwiseCell,
  StrategyId,
  TournamentConfig,
  TournamentResult,
} from './types'
import { STRATEGY_META } from './types'

const STRATEGIES: StrategyId[] = ['random', 'greedy', 'void', 'qlearn', 'ismcts']

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function round(value: number, digits = 1): number {
  const power = 10 ** digits
  return Math.round(value * power) / power
}

function summarize(id: StrategyId, games: GameResult[]): AgentSummary {
  const meta = STRATEGY_META[id]
  const successRate = average(games.map((game) => Number(game.success))) * 100
  const taskRate = average(games.map((game) => game.tasksWon / game.taskCount)) * 100
  const rocketConservation = average(games.map((game) => (3 - game.rocketsSpent) / 3)) * 100
  const rating = successRate * 0.7 + taskRate * 0.25 + Math.max(0, rocketConservation) * 0.05
  const bestGame = games.reduce((best, game) => {
    if (game.score !== best.score) return game.score > best.score ? game : best
    if (game.tasksWon !== best.tasksWon) return game.tasksWon > best.tasksWon ? game : best
    return game.rocketsSpent < best.rocketsSpent ? game : best
  })
  return {
    id,
    ...meta,
    successRate: round(successRate),
    avgScore: round(average(games.map((game) => game.score))),
    taskRate: round(taskRate),
    rocketConservation: round(Math.max(0, rocketConservation)),
    avgNodes: Math.round(average(games.map((game) => game.nodes))),
    rating: round(rating),
    wins: 0,
    bestGame,
    scores: games.map((game) => game.score),
  }
}

function pairwise(results: Map<StrategyId, GameResult[]>): PairwiseCell[] {
  return STRATEGIES.flatMap((row) =>
    STRATEGIES.map((col) => {
      const rowGames = results.get(row)!
      const colGames = results.get(col)!
      let wins = 0
      let ties = 0
      rowGames.forEach((game, index) => {
        if (game.score > colGames[index].score) wins += 1
        else if (game.score === colGames[index].score) ties += 1
      })
      return {
        row,
        col,
        winRate: round((wins + ties * 0.5) / rowGames.length * 100),
        ties,
      }
    }),
  )
}

function makeInsights(summaries: AgentSummary[], cells: PairwiseCell[]): string[] {
  const [best, second] = summaries
  const robust = summaries.find((summary) =>
    summaries.every((other) => other.id === summary.id || (cells.find((cell) => cell.row === summary.id && cell.col === other.id)?.winRate ?? 0) >= 50),
  )
  const efficientFrontier = summaries.filter((candidate) =>
    !summaries.some((other) => other.rating > candidate.rating && other.avgNodes < candidate.avgNodes),
  )
  const stable = [...summaries].sort((a, b) => {
    const spreadA = Math.max(...a.scores) - Math.min(...a.scores)
    const spreadB = Math.max(...b.scores) - Math.min(...b.scores)
    return spreadA - spreadB
  })[0]
  return [
    `${best.shortName} leads the matched-deal tournament by ${round(best.rating - second.rating)} rating points; its advantage comes from ${best.successRate}% full-mission success, not isolated high rolls.`,
    robust
      ? `${robust.shortName} is empirically weakly dominant: it scores at least as well as every alternative on 50% or more of identical deals.`
      : `No policy is dominant across every head-to-head comparison, so the benchmark retains meaningful deal-dependent trade-offs.`,
    `The score/compute Pareto frontier contains ${efficientFrontier.map((agent) => agent.shortName).join(', ')}; policies off this frontier cost more decisions while returning a lower rating.`,
    `${stable.shortName} has the tightest score range across all sampled missions, making it the least deal-sensitive policy in this run.`,
  ]
}

export function runTournament(config: TournamentConfig, onProgress?: (progress: number, phase: string) => void): TournamentResult {
  const started = performance.now()
  const qAgent = createLearningAgent()
  qAgent.setTraining(true)
  for (let episode = 0; episode < config.trainingEpisodes; episode += 1) {
    playGame({
      seed: config.baseSeed + 1_000_003 + episode * 7919,
      taskCount: config.taskCount,
      strategyId: 'qlearn',
      mctsRollouts: config.mctsRollouts,
      training: true,
      recordTrace: false,
    }, qAgent)
    if (episode % 50 === 0) onProgress?.((episode / Math.max(1, config.trainingEpisodes)) * 20, 'Training Echo Learner')
  }
  qAgent.setTraining(false)

  const allResults = new Map<StrategyId, GameResult[]>()
  STRATEGIES.forEach((id) => allResults.set(id, []))
  const totalEvaluations = STRATEGIES.length * config.games
  let completed = 0

  for (const id of STRATEGIES) {
    const agent = createAgent(id, config.mctsRollouts, id === 'qlearn' ? qAgent : undefined)
    for (let game = 0; game < config.games; game += 1) {
      const seed = config.baseSeed + game * 104729
      const result = playGame({
        seed,
        taskCount: config.taskCount,
        strategyId: id,
        mctsRollouts: config.mctsRollouts,
        recordTrace: true,
      }, agent)
      allResults.get(id)!.push(result)
      completed += 1
      if (completed % 4 === 0) onProgress?.(20 + (completed / totalEvaluations) * 79, `Evaluating ${STRATEGY_META[id].shortName}`)
    }
  }

  const summaries = STRATEGIES.map((id) => summarize(id, allResults.get(id)!)).sort((a, b) => b.rating - a.rating)
  for (let game = 0; game < config.games; game += 1) {
    const bestScore = Math.max(...STRATEGIES.map((id) => allResults.get(id)![game].score))
    for (const summary of summaries) {
      if (allResults.get(summary.id)![game].score === bestScore) summary.wins += 1
    }
  }
  const cells = pairwise(allResults)
  const bestAgent = summaries[0]
  const result: TournamentResult = {
    config,
    summaries,
    pairwise: cells,
    bestAgent,
    bestGame: bestAgent.bestGame,
    totalGames: totalEvaluations + config.trainingEpisodes,
    elapsedMs: Math.round(performance.now() - started),
    insights: makeInsights(summaries, cells),
  }
  onProgress?.(100, 'Analysis complete')
  return result
}
