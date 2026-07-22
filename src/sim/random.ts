import type { RandomSource } from './types'

export class SeededRandom implements RandomSource {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(max: number): number {
    return Math.floor(this.next() * max)
  }

  shuffle<T>(values: T[]): T[] {
    const copy = [...values]
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  fork(salt: number): RandomSource {
    return new SeededRandom((this.state ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0)
  }
}
