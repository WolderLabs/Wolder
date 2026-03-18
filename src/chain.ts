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

export class ScopeBuilderImpl implements ScopeBuilder {
  private scopeFiles: string[] = []

  constructor(
    path: string,
    private readonly root: string,
    private readonly model: string,
  ) {
    this.scopeFiles.push(path)
  }

  scope(path: string): ScopeBuilder {
    this.scopeFiles.push(path)
    return this
  }

  act(instruction: string): ActBuilder {
    return new ActBuilderImpl(
      [...this.scopeFiles],
      instruction,
      this.root,
      this.model,
    )
  }
}

export class ActBuilderImpl implements ActBuilder, ClassExpectationBuilder, InterfaceExpectationBuilder {
  private inputs: Array<InputRef | Artifact | MemberRef> = []
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

  withInput(ref: InputRef | Artifact | MemberRef): ActBuilder {
    this.inputs.push(ref)
    return this
  }

  expectFile(path: string): ActBuilder {
    this.expectations.push({ type: "file", path })
    this.currentClass = null
    this.currentInterface = null
    return this
  }

  expectClass(name: string): ClassExpectationBuilder {
    this.expectations.push({ type: "class", name })
    this.currentClass = name
    this.currentInterface = null
    return this
  }

  withFunction(name: string): ClassExpectationBuilder {
    this.expectations.push({
      type: "function",
      name,
      className: this.currentClass!,
    })
    this.memberNames.push(name)
    return this
  }

  expectInterface(name: string): InterfaceExpectationBuilder {
    this.expectations.push({ type: "interface", name })
    this.currentInterface = name
    this.currentClass = null
    return this
  }

  withMethod(name: string): InterfaceExpectationBuilder {
    this.expectations.push({
      type: "method",
      name,
      className: this.currentInterface!,
    })
    this.memberNames.push(name)
    return this
  }

  expectCompiles(): ActBuilder {
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

  async build(): Promise<Artifact> {
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
      .filter((i): i is Artifact => i.kind === "artifact")
      .map((a) => a.id)

    const members: Record<string, MemberRef> = {}
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
      }
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
    }
  }
}
