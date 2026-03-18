export class Counter {
  private count: number = 0

  increment(): number {
    return ++this.count
  }

  getCount(): number {
    return this.count
  }
}
