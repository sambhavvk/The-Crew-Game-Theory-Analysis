/// <reference lib="webworker" />
import { runTournament } from './tournament'
import type { TournamentConfig } from './types'

self.onmessage = (event: MessageEvent<TournamentConfig>) => {
  try {
    const result = runTournament(event.data, (progress, phase) => {
      self.postMessage({ type: 'progress', progress, phase })
    })
    self.postMessage({ type: 'complete', result })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
