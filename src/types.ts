export interface WolderOptions {
  root: string
  model: string
}

export interface WolderInstance {
  input(path: string): InputRef
  scope(path: string): ScopeBuilder
}

export interface InputRef {
  readonly path: string
  readonly kind: "input"
}

export interface MemberRef<N extends string = string> {
  readonly name: N
  readonly kind: "member"
}

export interface Artifact<TMembers extends Record<string, MemberRef> = Record<string, MemberRef>> {
  readonly id: string
  readonly generatedFiles: string[]
  readonly members: TMembers
}

export interface ScopeBuilder {
  scope(path: string): ScopeBuilder
  act(instruction: string): ActBuilder
}

export interface Expectation {
  type: string
  [key: string]: unknown
}

export interface ActBuilder {
  withInput(ref: InputRef | Artifact | MemberRef): ActBuilder
  expectFile(path: string): ActBuilder
  expectClass(name: string): ClassExpectationBuilder
  expectInterface(name: string): InterfaceExpectationBuilder
  expectCompiles(): ActBuilder
  build(): Promise<Artifact>
}

export interface ClassExpectationBuilder extends ActBuilder {
  withFunction(name: string): ClassExpectationBuilder
}

export interface InterfaceExpectationBuilder extends ActBuilder {
  withMethod(name: string): InterfaceExpectationBuilder
}
