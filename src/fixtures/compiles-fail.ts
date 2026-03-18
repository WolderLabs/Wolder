export class Broken {
  getValue(): string {
    // Type error: returning number instead of string
    return 42
  }

  process(x: number): void {
    // Type error: calling nonexistent method
    this.nonExistentMethod(x)
  }
}
