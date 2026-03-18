import type {
  ScopeBuilder,
  ActBuilder,
  Artifact,
  InputRef,
  MemberRef,
  Expectation,
  NodeDefinition,
  ExtractMembers,
  Plugin,
  PluginBuilder,
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
import * as log from "./log.js"

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
  implements ActBuilder<TMembers>
{
  private inputs: Array<InputRef | Artifact<any> | MemberRef> = []
  private expectations: Expectation[] = []
  private memberNames: string[] = []
  private plugins: Plugin<any>[] = []

  constructor(
    private readonly scopeFiles: string[],
    private readonly instruction: string,
    private readonly root: string,
    private readonly model: string,
  ) {}

  withInput(ref: InputRef | Artifact<any> | MemberRef): this {
    this.inputs.push(ref)
    return this
  }

  expectFile(path: string): this {
    this.expectations.push({ type: "file", path })
    return this
  }

  withArtifactTrait<N extends string>(name: N): ActBuilder<[...TMembers, N]> {
    this.memberNames.push(name)
    return this as unknown as ActBuilderImpl<[...TMembers, N]>
  }

  expect(plugin: Plugin<any>, fn?: (e: any) => any): any {
    if (!this.plugins.find((p) => p.name === plugin.name)) {
      this.plugins.push(plugin)
    }
    if (fn) {
      const builder = plugin.createBuilder(
        (exp: Expectation) => this.expectations.push(exp),
        (name: string) => this.memberNames.push(name),
      )
      fn(builder)
    } else {
      for (const exp of plugin.defaultExpectations ?? []) {
        this.expectations.push(exp)
      }
    }
    return this
  }

  getNodeDefinition(): NodeDefinition {
    return {
      scopeFiles: [...this.scopeFiles],
      actInstruction: this.instruction,
      inputs: [...this.inputs],
      expectations: [...this.expectations],
      memberNames: [...this.memberNames],
      plugins: [...this.plugins],
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
      node.scopeFiles,
      node.expectations,
    )

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

    if (isFresh(manifest, id, inputHashes)) {
      log.success(`${log.bold(id)} is fresh — skipping generation`)
      const cached = manifest.nodes[id]!
      return {
        kind: "artifact",
        id,
        outputHash: cached.outputHash,
        generatedFiles: cached.generatedFiles,
        members,
      } as Artifact<ExtractMembers<TMembers>>
    }

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
