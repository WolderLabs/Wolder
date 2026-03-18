export interface ITodoService {
  getAllItems(): string[]
  addItem(item: string): void
}
