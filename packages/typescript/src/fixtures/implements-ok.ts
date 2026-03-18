import type { ICounter } from "./i-counter.js"

export class Counter implements ICounter {
  private count: number = 0

  increment(): number {
    return ++this.count
  }

  getCount(): number {
    return this.count
  }
}
