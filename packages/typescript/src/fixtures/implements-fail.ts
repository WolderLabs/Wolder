import type { ICounter } from "./i-counter.js"

export class BadCounter implements ICounter {
  // Missing increment() and getCount()
  reset(): void {}
}
