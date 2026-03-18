import type {
  ScopeBuilder,
  ActBuilder,
  ClassExpectationBuilder,
  InterfaceExpectationBuilder,
  Artifact,
  InputRef,
  MemberRef,
  Expectation,
  NodeDefinition,
  ExtractMembers,
} from "./types.js"
import { generate } from "./generate.js"
import {
  readManifest,
  writeManifest,
  updateManifestNode,
  computeOutputHash,
  computeInputHashes,
  isFresh,
} from "./manifest.js"

export class ScopeBuilderImpl<TMembers extends readonly string[] = []>
  implements ScopeBuilder<TMembers>
{
  private scopeFiles: string[] = []

  constructor(
    path: string,
    private readonly root: string,
    private readonly model: string,
  ) {
    this.scopeFiles.push(path)
  }

  scope(path: string): ScopeBuilder<TMembers> {
    this.scopeFiles.push(path)
    return this
  }

  act(instruction: string): ActBuilder<TMembers> {
    return new ActBuilderImpl<TMembers>(
      [...this.scopeFiles],
      instruction,
      this.root,
      this.model,
    )
  }
}

export class ActBuilderImpl<TMembers extends readonly string[] = []>
  implements
    ActBuilder<TMembers>,
    ClassExpectationBuilder<TMembers>,
    InterfaceExpectationBuilder<TMembers>
{
  private inputs: Array<InputRef | Artifact<any> | MemberRef> = []
  private expectations: Expectation[] = []
  private memberNames: string[] = []
  private currentClass: string | null = null
  private currentInterface: string | null = null

  constructor(
    private readonly scopeFiles: string[],
    private readonly instruction: string,
    private readonly root: string,
    private readonly model: string,
  ) {}

  withInput(ref: InputRef | Artifact<any> | MemberRef): ActBuilder<TMembers> {
    this.inputs.push(ref)
    return this
  }

  expectFile(path: string): ActBuilder<TMembers> {
    this.expectations.push({ type: "file", path })
    this.currentClass = null
    this.currentInterface = null
    return this
  }

  expectClass(name: string): ClassExpectationBuilder<TMembers> {
    this.expectations.push({ type: "class", name })
    this.currentClass = name
    this.currentInterface = null
    return this
  }

  withFunction<N extends string>(name: N): ClassExpectationBuilder<[...TMembers, N]> {
    this.expectations.push({
      type: "function",
      name,
      className: this.currentClass!,
    })
    this.memberNames.push(name)
    // Cast: the runtime object is the same, but the type gains N
    return this as unknown as ActBuilderImpl<[...TMembers, N]>
  }

  expectInterface(name: string): InterfaceExpectationBuilder<TMembers> {
    this.expectations.push({ type: "interface", name })
    this.currentInterface = name
    this.currentClass = null
    return this
  }

  withMethod<N extends string>(name: N): InterfaceExpectationBuilder<[...TMembers, N]> {
    this.expectations.push({
      type: "method",
      name,
      className: this.currentInterface!,
    })
    this.memberNames.push(name)
    return this as unknown as ActBuilderImpl<[...TMembers, N]>
  }

  expectImplements(interfaceRef: InputRef): this {
    this.expectations.push({
      type: "implements",
      interfacePath: interfaceRef.path,
    })
    return this
  }

  expectCompiles(): ActBuilder<TMembers> {
    this.expectations.push({ type: "compiles" })
    return this
  }

  getNodeDefinition(): NodeDefinition {
    return {
      scopeFiles: [...this.scopeFiles],
      actInstruction: this.instruction,
      inputs: [...this.inputs],
      expectations: [...this.expectations],
      memberNames: [...this.memberNames],
    }
  }

  async build(): Promise<Artifact<ExtractMembers<TMembers>>> {
    const node = this.getNodeDefinition()
    const id = node.scopeFiles.join("+")
    const manifest = readManifest(this.root)
    const inputHashes = computeInputHashes(
      node.actInstruction,
      node.inputs,
      this.model,
      this.root,
    )

    // Extract dependency edges (artifact IDs this node depends on)
    const dependsOn = node.inputs
      .filter((i): i is Artifact<any> => i.kind === "artifact")
      .map((a) => a.id)

    const members = {} as Record<string, MemberRef>
    for (const name of node.memberNames) {
      members[name] = {
        name,
        kind: "member",
        className: "",
        filePath: node.scopeFiles[0] ?? "",
      }
    }

    // Cache hit — skip generation
    if (isFresh(manifest, id, inputHashes)) {
      const cached = manifest.nodes[id]!
      return {
        kind: "artifact",
        id,
        outputHash: cached.outputHash,
        generatedFiles: cached.generatedFiles,
        members,
      } as Artifact<ExtractMembers<TMembers>>
    }

    // Cache miss — generate
    const result = await generate(node, {
      root: this.root,
      model: this.model,
    })

    const outputHash = computeOutputHash(result.files)
    updateManifestNode(manifest, id, {
      inputHashes,
      outputHash,
      generatedFiles: result.files.map((f) => f.path),
      expectations: node.expectations,
      dependsOn,
    })
    writeManifest(manifest, this.root)

    return {
      kind: "artifact",
      id,
      outputHash,
      generatedFiles: result.files.map((f) => f.path),
      members,
    } as Artifact<ExtractMembers<TMembers>>
  }
}
