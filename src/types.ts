export interface WolderOptions {
  root: string
  model: string
}

export interface WolderInstance {
  input(path: string): InputRef
  scope(path: string): ScopeBuilder<[]>
}

export interface InputRef {
  readonly path: string
  readonly kind: "input"
}

export interface MemberRef<N extends string = string> {
  readonly name: N
  readonly kind: "member"
  readonly className: string
  readonly filePath: string
}

// Convert a tuple of member names to a typed members record
export type ExtractMembers<T extends readonly string[]> = {
  [K in T[number]]: MemberRef<K>
}

export interface Artifact<TMembers extends Record<string, MemberRef> = Record<string, MemberRef>> {
  readonly kind: "artifact"
  readonly id: string
  readonly outputHash: string
  readonly generatedFiles: string[]
  readonly members: TMembers
}

export interface ScopeBuilder<TMembers extends readonly string[] = []> {
  scope(path: string): ScopeBuilder<TMembers>
  act(instruction: string): ActBuilder<TMembers>
}

export interface Expectation {
  type: string
  name?: string
  path?: string
  className?: string
  interfacePath?: string
}

export interface ActBuilder<TMembers extends readonly string[] = []> {
  withInput(ref: InputRef | Artifact<any> | MemberRef): ActBuilder<TMembers>
  expectFile(path: string): ActBuilder<TMembers>
  expectClass(name: string): ClassExpectationBuilder<TMembers>
  expectInterface(name: string): InterfaceExpectationBuilder<TMembers>
  expectImplements(interfaceRef: InputRef): this
  expectCompiles(): ActBuilder<TMembers>
  build(): Promise<Artifact<ExtractMembers<TMembers>>>
}

export interface ClassExpectationBuilder<TMembers extends readonly string[] = []> extends ActBuilder<TMembers> {
  withFunction<N extends string>(name: N): ClassExpectationBuilder<[...TMembers, N]>
}

export interface InterfaceExpectationBuilder<TMembers extends readonly string[] = []> extends ActBuilder<TMembers> {
  withMethod<N extends string>(name: N): InterfaceExpectationBuilder<[...TMembers, N]>
}

// Internal node definition — everything captured by a single chain
export interface NodeDefinition {
  scopeFiles: string[]
  actInstruction: string
  inputs: Array<InputRef | Artifact<any> | MemberRef>
  expectations: Expectation[]
  memberNames: string[]
}
