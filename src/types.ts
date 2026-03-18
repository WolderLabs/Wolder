export interface WolderConfig {
  model?: string
  apiKey?: string
  temperature?: number
  devCommand?: string
  devPort?: number
  devReadyPattern?: string
  maxRetries?: number
  manifestPath?: string
  protectedPatterns?: string[]
}

export interface WolderOptions {
  root: string
  model: string
  config?: WolderConfig
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
  route?: string
  description?: string
  compiledAssertion?: string
  testFile?: string
}

export interface ExpectationResult {
  expectation: Expectation
  pass: boolean
  error?: string
}

export interface PluginRunContext {
  allExpectations: Expectation[]
  scopeFiles: string[]
  root: string
  model: string
  apiKey?: string
}

// Phantom type that accumulates member names through plugin builder chains
export interface PluginBuilder<TMembers extends readonly string[] = []> {
  readonly _members: TMembers
}

export interface Plugin<TInitialBuilder = unknown> {
  readonly name: string
  readonly expectationTypes: readonly string[]
  /** Expectations added when expect(plugin) is called without a callback */
  readonly defaultExpectations?: Expectation[]
  createBuilder(
    addExpectation: (exp: Expectation) => void,
    addMember: (name: string) => void,
  ): TInitialBuilder
  runExpectations(
    ownExpectations: Expectation[],
    context: PluginRunContext,
  ): Promise<ExpectationResult[]>
  formatExpectations(expectations: Expectation[]): string[]
  preGenerate?(
    ownExpectations: Expectation[],
    context: PluginRunContext,
  ): Promise<{ testFile: { path: string; content: string } } | null>
}

export interface ActBuilder<TMembers extends readonly string[] = []> {
  withInput(ref: InputRef | Artifact<any> | MemberRef): this
  expectFile(path: string): this
  withArtifactTrait<N extends string>(name: N): ActBuilder<[...TMembers, N]>
  /** Register a plugin without a callback — uses plugin.defaultExpectations */
  expect(plugin: Plugin<any>): this
  /** Register a plugin with a callback — member names from return type flow into artifact.members */
  expect<TInit, TResult extends PluginBuilder<readonly string[]>>(
    plugin: Plugin<TInit>,
    fn: (e: TInit) => TResult,
  ): ActBuilder<[...TMembers, ...TResult["_members"]]>
  build(): Promise<Artifact<ExtractMembers<TMembers>>>
}

// Internal node definition — everything captured by a single chain
export interface NodeDefinition {
  scopeFiles: string[]
  actInstruction: string
  inputs: Array<InputRef | Artifact<any> | MemberRef>
  expectations: Expectation[]
  memberNames: string[]
  plugins: Plugin<any>[]
}
