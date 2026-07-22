import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Atom,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  CircleDot,
  Gauge,
  Orbit,
  Play,
  RotateCcw,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import type { AgentSummary, Card, StrategyId, TournamentConfig, TournamentResult, TrickRecord } from './sim/types'

type View = 'overview' | 'matchups' | 'replay' | 'method'

const DEFAULT_CONFIG: TournamentConfig = {
  games: 30,
  taskCount: 3,
  mctsRollouts: 24,
  trainingEpisodes: 500,
  baseSeed: 260722,
}

const strategyColors: Record<StrategyId, string> = {
  random: '#9a8eb5',
  greedy: '#ee8158',
  void: '#4aa58b',
  qlearn: '#5379c7',
  ismcts: '#e1a530',
}

const suitGlyph: Record<Card['suit'], string> = {
  pink: '●',
  green: '▲',
  blue: '◆',
  yellow: '■',
  rocket: '↟',
}

function pct(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`
}

function OrbitalRanking({ summaries }: { summaries: AgentSummary[] }) {
  const ordered = [...summaries].sort((a, b) => b.rating - a.rating)
  return (
    <div className="orbit-stage" aria-label="Orbital ranking of agents">
      <svg viewBox="0 0 620 470" role="img">
        <title>Agent ranking, with higher-rated strategies closer to the mission core</title>
        <g className="orbit-rings">
          {[72, 112, 152, 192, 225].map((radius) => <circle key={radius} cx="310" cy="235" r={radius} />)}
          <path d="M73 235h474M310 12v446" />
        </g>
        <g className="mission-core">
          <circle cx="310" cy="235" r="37" />
          <circle cx="310" cy="235" r="6" />
          <text x="310" y="291">MISSION CORE</text>
        </g>
        {ordered.map((agent, index) => {
          const angle = (-88 + index * 67) * (Math.PI / 180)
          const radius = 76 + index * 36
          const x = 310 + Math.cos(angle) * radius
          const y = 235 + Math.sin(angle) * radius
          const anchor = x < 270 ? 'end' : 'start'
          const labelX = x + (x < 270 ? -16 : 16)
          return (
            <g key={agent.id} className="orbit-agent">
              <line x1="310" y1="235" x2={x} y2={y} />
              <circle cx={x} cy={y} r={index === 0 ? 13 : 9} fill={strategyColors[agent.id]} />
              {index === 0 && <circle className="pulse-ring" cx={x} cy={y} r="21" />}
              <text x={labelX} y={y - 3} textAnchor={anchor}>{agent.shortName}</text>
              <text className="orbit-rating" x={labelX} y={y + 14} textAnchor={anchor}>{agent.rating.toFixed(1)} rating</text>
            </g>
          )
        })}
      </svg>
      <div className="orbit-caption"><CircleDot size={14} /> Proximity to core shows final rank</div>
    </div>
  )
}

function StrategyMark({ id }: { id: StrategyId }) {
  const icons = {
    random: Activity,
    greedy: Target,
    void: Route,
    qlearn: BrainCircuit,
    ismcts: Atom,
  }
  const Icon = icons[id]
  return <span className="strategy-mark" style={{ '--agent-color': strategyColors[id] } as React.CSSProperties}><Icon size={18} /></span>
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return <span className="score-track" aria-label={`${value} out of 100`}><span style={{ width: `${value}%`, background: color }} /></span>
}

function RankingTable({ summaries }: { summaries: AgentSummary[] }) {
  return (
    <div className="ranking-table">
      <div className="ranking-head">
        <span>Policy</span><span>Rating</span><span>Mission success</span><span>Tasks</span><span>Search cost</span>
      </div>
      {summaries.map((agent, index) => (
        <div className={`ranking-row ${index === 0 ? 'champion-row' : ''}`} key={agent.id}>
          <div className="agent-name-cell">
            <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
            <StrategyMark id={agent.id} />
            <span><strong>{agent.name}</strong><small>{agent.family}</small></span>
          </div>
          <div className="rating-cell"><strong>{agent.rating.toFixed(1)}</strong><ScoreBar value={agent.rating} color={strategyColors[agent.id]} /></div>
          <strong>{pct(agent.successRate)}</strong>
          <span>{pct(agent.taskRate)}</span>
          <span>{agent.avgNodes.toLocaleString()} nodes</span>
        </div>
      ))}
    </div>
  )
}

function AgentCards({ summaries }: { summaries: AgentSummary[] }) {
  return (
    <div className="agent-card-grid">
      {summaries.map((agent) => (
        <article className="agent-card" key={agent.id} style={{ '--agent-color': strategyColors[agent.id] } as React.CSSProperties}>
          <div className="agent-card-top"><StrategyMark id={agent.id} /><span>{agent.family}</span></div>
          <h3>{agent.name}</h3>
          <p>{agent.description}</p>
          <div className="agent-mini-stats">
            <span><strong>{pct(agent.successRate)}</strong> success</span>
            <span><strong>{pct(agent.rocketConservation)}</strong> rockets held</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function Overview({ result, setView }: { result: TournamentResult; setView: (view: View) => void }) {
  const best = result.bestAgent
  return (
    <>
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><Orbit size={15} /> Post-mission strategy report</div>
          <h1>Five minds.<br /><em>One silent crew.</em></h1>
          <p className="hero-lede">A matched-deal tournament reveals which non-LLM decision system coordinates best when nobody can show their hand.</p>
          <div className="champion-plate">
            <span className="plate-label"><Trophy size={14} /> Highest scoring policy</span>
            <div><StrategyMark id={best.id} /><strong>{best.name}</strong><b>{best.rating.toFixed(1)}</b></div>
            <small>{best.successRate}% mission success across {result.config.games} evaluation deals</small>
          </div>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => setView('replay')}><Play size={16} fill="currentColor" /> Replay best mission</button>
            <button className="text-button" onClick={() => setView('matchups')}>Open game theory report <ChevronRight size={16} /></button>
          </div>
        </div>
        <OrbitalRanking summaries={result.summaries} />
      </section>

      <section className="metrics-strip" aria-label="Tournament summary">
        <div><span>Simulated decisions</span><strong>{result.summaries.reduce((sum, agent) => sum + agent.avgNodes * result.config.games, 0).toLocaleString()}</strong></div>
        <div><span>Matched missions</span><strong>{result.config.games}</strong></div>
        <div><span>Capture tasks / mission</span><strong>{result.config.taskCount}</strong></div>
        <div><span>Analysis time</span><strong>{(result.elapsedMs / 1000).toFixed(1)}s</strong></div>
      </section>

      <section className="content-section">
        <div className="section-heading"><div><span className="eyebrow">Final standings</span><h2>Coordination, measured.</h2></div><p>Rating = 70% complete missions, 25% task captures, 5% rocket conservation.</p></div>
        <RankingTable summaries={result.summaries} />
      </section>

      <section className="content-section agent-roster">
        <div className="section-heading"><div><span className="eyebrow">The flight systems</span><h2>No language model aboard.</h2></div><p>Each team uses one policy at all four seats and sees only legal public information plus its own hand.</p></div>
        <AgentCards summaries={result.summaries} />
      </section>
    </>
  )
}

function Matchups({ result }: { result: TournamentResult }) {
  const byId = Object.fromEntries(result.summaries.map((agent) => [agent.id, agent])) as Record<StrategyId, AgentSummary>
  return (
    <section className="report-page">
      <div className="page-intro">
        <div><span className="eyebrow"><Gauge size={15} /> Game theory report</span><h1>Who beats whom<br />on the <em>same deals?</em></h1></div>
        <p>This is a cooperative game, so the relevant contest is between policies, not players. Each cell is the row policy’s scoring win rate against the column policy on identical missions; ties count as half a win.</p>
      </div>
      <div className="matrix-wrap">
        <div className="matrix-title"><h2>Matched-deal dominance matrix</h2><span>Row policy advantage</span></div>
        <div className="payoff-matrix" style={{ '--count': result.summaries.length } as React.CSSProperties}>
          <div className="matrix-corner">ROW \ COL</div>
          {result.summaries.map((agent) => <div className="matrix-col" key={agent.id}><StrategyMark id={agent.id} /><span>{agent.shortName}</span></div>)}
          {result.summaries.flatMap((row) => [
            <div className="matrix-row" key={`${row.id}-label`}><StrategyMark id={row.id} /><span>{row.shortName}</span></div>,
            ...result.summaries.map((col) => {
              const cell = result.pairwise.find((candidate) => candidate.row === row.id && candidate.col === col.id)!
              const strength = Math.abs(cell.winRate - 50) / 50
              const positive = cell.winRate >= 50
              return <div key={`${row.id}-${col.id}`} className={`matrix-cell ${row.id === col.id ? 'diagonal' : ''}`} style={{ '--cell-alpha': 0.08 + strength * 0.38, '--cell-color': positive ? '#4aa58b' : '#ee8158' } as React.CSSProperties}><strong>{cell.winRate.toFixed(0)}</strong><small>%</small></div>
            }),
          ])}
        </div>
      </div>
      <div className="analysis-grid">
        <div className="analysis-notes">
          <span className="eyebrow">Findings from all {result.config.games * result.summaries.length} evaluation games</span>
          {result.insights.map((insight, index) => <div className="finding" key={insight}><span>{index + 1}</span><p>{insight}</p></div>)}
        </div>
        <div className="frontier-card">
          <div className="frontier-heading"><h3>Score / compute frontier</h3><span>Upper-left is efficient</span></div>
          <div className="scatter">
            {[25, 50, 75].map((line) => <i key={line} style={{ bottom: `${line}%` }} />)}
            {result.summaries.map((agent) => {
              const maxNodes = Math.max(...result.summaries.map((item) => item.avgNodes))
              const x = 8 + Math.log10(agent.avgNodes + 1) / Math.log10(maxNodes + 1) * 80
              const y = 8 + agent.rating * 0.82
              return <div className="scatter-point" key={agent.id} style={{ left: `${x}%`, bottom: `${y}%`, '--agent-color': strategyColors[agent.id] } as React.CSSProperties}><span>{agent.shortName}</span></div>
            })}
            <b className="axis-y">Rating ↑</b><b className="axis-x">Decision nodes →</b>
          </div>
        </div>
      </div>
      <div className="definition-note"><ShieldCheck size={18} /><p><strong>Game-theory lens.</strong> The Crew is a common-payoff game: all seats win or lose together. We therefore test empirical dominance, coordination stability, regret on matched deals, and the score/compute Pareto frontier—not zero-sum Nash equilibrium claims.</p></div>
      <div className="sr-only">Top agent is {byId[result.bestAgent.id].name}</div>
    </section>
  )
}

function PlayingCard({ card, small = false }: { card: Card; small?: boolean }) {
  return <span className={`playing-card suit-${card.suit} ${small ? 'small' : ''}`}><b>{card.rank}</b><i>{suitGlyph[card.suit]}</i></span>
}

function TrickTable({ trick }: { trick: TrickRecord }) {
  const positions = ['north', 'east', 'south', 'west']
  return (
    <div className="trick-table">
      <div className="table-core"><span>TRICK {trick.index + 1}</span><strong>Crew {trick.winner + 1}</strong><small>takes the trick</small></div>
      {trick.plays.map((play) => (
        <div className={`table-seat ${positions[play.seat]} ${play.seat === trick.winner ? 'winner' : ''}`} key={play.seat}>
          <span>Crew {play.seat + 1}{play.seat === trick.leader ? ' · lead' : ''}</span>
          <PlayingCard card={play.card} />
        </div>
      ))}
    </div>
  )
}

function Replay({ result }: { result: TournamentResult }) {
  const game = result.bestGame
  const [trickIndex, setTrickIndex] = useState(0)
  useEffect(() => setTrickIndex(0), [game.seed])
  const trick = game.history[trickIndex]
  return (
    <section className="report-page replay-page">
      <div className="page-intro compact">
        <div><span className="eyebrow"><Play size={14} /> Flight recorder · seed {game.seed}</span><h1>The champion’s<br /><em>cleanest mission.</em></h1></div>
        <div className="replay-score"><span>Mission score</span><strong>{game.score}</strong><small>{game.success ? 'All objectives secured' : `${game.tasksWon}/${game.taskCount} objectives secured`}</small></div>
      </div>
      <div className="replay-layout">
        <div className="trick-panel">
          {trick ? <TrickTable trick={trick} /> : <p>No recorded trick data.</p>}
          <div className="timeline-controls">
            <button onClick={() => setTrickIndex((value) => Math.max(0, value - 1))} disabled={trickIndex === 0}>Previous</button>
            <div className="trick-timeline">
              {game.history.map((item, index) => <button key={item.index} className={`${index === trickIndex ? 'active' : ''} ${item.taskIds.length ? 'task-trick' : ''}`} onClick={() => setTrickIndex(index)} aria-label={`Show trick ${index + 1}`}><span /></button>)}
            </div>
            <button onClick={() => setTrickIndex((value) => Math.min(game.history.length - 1, value + 1))} disabled={trickIndex === game.history.length - 1}>Next</button>
          </div>
        </div>
        <aside className="mission-manifest">
          <span className="eyebrow">Objective manifest</span>
          <h2>{result.bestAgent.name}</h2>
          <p>All four seats ran the same policy. Commander: Crew {game.commander + 1}.</p>
          <div className="task-list">
            {game.tasks.map((task) => (
              <div className={`task-item ${task.status}`} key={task.id}>
                <PlayingCard card={task.card} small />
                <span><strong>{task.id} · Crew {task.target + 1}</strong><small>{task.status === 'won' ? `Captured in trick ${(task.resolvedTrick ?? 0) + 1}` : 'Objective lost'}</small></span>
                <i>{task.status === 'won' ? 'SECURED' : 'LOST'}</i>
              </div>
            ))}
          </div>
          <div className="manifest-metrics"><span><strong>{game.rocketsSpent}</strong> small rockets spent</span><span><strong>{game.nodes.toLocaleString()}</strong> decision nodes</span></div>
        </aside>
      </div>
    </section>
  )
}

function Methodology() {
  const rules = [
    ['Deck', 'Four coloured suits numbered 1–9 plus four rockets numbered 1–4.'],
    ['Tricks', 'Players must follow the led suit when able; rockets trump coloured cards.'],
    ['Mission', 'Three coloured cards are seeded as capture objectives and assigned to crew members.'],
    ['Information', 'Policies see their own hand, public objectives, the current trick, and prior tricks—never another live hand.'],
    ['Benchmark', 'Every policy plays the exact same deals. One policy controls all four seats to measure coordination quality.'],
    ['Learning', 'Q-learning trains on separate seeded missions; evaluation seeds are held out.'],
  ]
  return (
    <section className="report-page method-page">
      <div className="page-intro"><div><span className="eyebrow"><BookOpen size={15} /> Rules & reproducibility</span><h1>What this lab<br /><em>actually measures.</em></h1></div><p>A transparent benchmark inspired by The Crew: The Quest for Planet Nine. It isolates card-play coordination; campaign-specific mission modifiers and the physical radio token are outside this version.</p></div>
      <div className="method-grid">
        {rules.map(([title, body], index) => <div className="method-item" key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}
      </div>
      <div className="formula-card">
        <span className="eyebrow">Rating formula</span>
        <div><strong>0.70</strong><span>Mission success</span><i>+</i><strong>0.25</strong><span>Tasks captured</span><i>+</i><strong>0.05</strong><span>Rocket conservation</span></div>
        <p>Success dominates the score. Partial task completion separates failed missions; rocket conservation is only a small tie-break signal.</p>
      </div>
      <div className="method-disclosure"><Users size={20} /><p><strong>No LLMs are used.</strong> Random sampling, a local greedy rule, a task-aware heuristic, tabular Q-learning, and information-set Monte Carlo tree search are all implemented locally in TypeScript. The tournament runs inside a Web Worker so the interface remains responsive.</p></div>
    </section>
  )
}

function ConfigPanel({ config, setConfig, running, onRun }: { config: TournamentConfig; setConfig: (value: TournamentConfig) => void; running: boolean; onRun: () => void }) {
  const options = [
    { key: 'games' as const, label: 'Evaluation deals', values: [20, 30, 60] },
    { key: 'taskCount' as const, label: 'Tasks / mission', values: [2, 3, 4] },
    { key: 'mctsRollouts' as const, label: 'Search budget', values: [12, 24, 48] },
    { key: 'trainingEpisodes' as const, label: 'RL training', values: [250, 500, 1000] },
  ]
  return (
    <div className="config-popover">
      {options.map((option) => <label key={option.key}><span>{option.label}</span><select value={config[option.key]} onChange={(event) => setConfig({ ...config, [option.key]: Number(event.target.value) })}>{option.values.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>)}
      <button className="primary-button" onClick={onRun} disabled={running}><RotateCcw size={15} /> {running ? 'Running…' : 'Run new tournament'}</button>
    </div>
  )
}

function App() {
  const [view, setView] = useState<View>('overview')
  const [result, setResult] = useState<TournamentResult | null>(null)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('Preparing simulation')
  const [error, setError] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  const run = useCallback(() => {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setRunning(true)
    setProgress(0)
    setError(null)
    worker.onmessage = (event) => {
      if (event.data.type === 'progress') {
        setProgress(event.data.progress)
        setPhase(event.data.phase)
      } else if (event.data.type === 'complete') {
        setResult(event.data.result)
        setRunning(false)
        setConfigOpen(false)
      } else if (event.data.type === 'error') {
        setError(event.data.message)
        setRunning(false)
      }
    }
    worker.postMessage(config)
  }, [config])

  useEffect(() => {
    run()
    return () => workerRef.current?.terminate()
    // Initial launch intentionally uses the default benchmark.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navItems: { id: View; label: string }[] = useMemo(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'matchups', label: 'Game theory' },
    { id: 'replay', label: 'Best game' },
    { id: 'method', label: 'Method' },
  ], [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setView('overview')} aria-label="The Crew Strategy Lab home"><span><Orbit size={19} /></span><strong>THE CREW</strong><i>STRATEGY LAB</i></button>
        <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
        <div className="run-control"><button className="run-button" onClick={() => setConfigOpen((open) => !open)}><Sparkles size={15} /> Configure run</button>{configOpen && <ConfigPanel config={config} setConfig={setConfig} running={running} onRun={run} />}</div>
      </header>

      {running && !result ? (
        <main className="loading-stage">
          <div className="loading-orbit"><Orbit size={58} /><span /></div>
          <span className="eyebrow">Live simulation</span>
          <h1>{phase}</h1>
          <p>All computation is local. Five policy teams are playing matched, seeded missions.</p>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <strong>{Math.round(progress)}%</strong>
        </main>
      ) : error ? (
        <main className="error-stage"><h1>Simulation halted</h1><p>{error}</p><button className="primary-button" onClick={run}>Try again</button></main>
      ) : result ? (
        <main>
          {running && <div className="rerun-banner"><span style={{ width: `${progress}%` }} /><p>{phase} · {Math.round(progress)}%</p></div>}
          {view === 'overview' && <Overview result={result} setView={setView} />}
          {view === 'matchups' && <Matchups result={result} />}
          {view === 'replay' && <Replay result={result} />}
          {view === 'method' && <Methodology />}
        </main>
      ) : null}

      <footer><span>THE CREW · STRATEGY LAB</span><p>Local simulation · Deterministic seeds · No language models</p><a href="https://www.thamesandkosmos.com/products/the-crew" target="_blank" rel="noreferrer">Original game by Thomas Sing ↗</a></footer>
    </div>
  )
}

export default App
