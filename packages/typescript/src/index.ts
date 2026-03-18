import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { Project } from "ts-morph"
import type {
  Plugin,
  PluginBuilder,
  Expectation,
  ExpectationResult,
  PluginRunContext,
  InputRef,
} from "../../../src/index.js"

export type { Plugin, PluginBuilder, Expectation, ExpectationResult, PluginRunContext }
export { wolder } from "../../../src/index.js"
export type {
  WolderConfig,
  WolderInstance,
  WolderOptions,
  InputRef,
  Artifact,
  MemberRef,
  ScopeBuilder,
  ActBuilder,
  NodeDefinition,
  ExtractMembers,
} from "../../../src/index.js"

export interface TypeScriptBuilder<TMembers extends readonly string[] = []>
  extends PluginBuilder<TMembers> {
  hasClass(name: string): TypeScriptBuilder<TMembers>
  hasInterface(name: string): TypeScriptBuilder<TMembers>
  withFunction<N extends string>(name: N): TypeScriptBuilder<[...TMembers, N]>
  withMethod<N extends string>(name: N): TypeScriptBuilder<[...TMembers, N]>
  compiles(): TypeScriptBuilder<TMembers>
  implements(ref: InputRef): TypeScriptBuilder<TMembers>
}

const TYPESCRIPT_TYPES = [
  "class",
  "interface",
  "function",
  "method",
  "compiles",
  "implements",
] as const

class TypeScriptBuilderImpl<TMembers extends readonly string[] = []>
  implements TypeScriptBuilder<TMembers>
{
  // Phantom — never read at runtime, only used by TypeScript's type system
  declare readonly _members: TMembers

  private currentClass: string | null = null
  private currentInterface: string | null = null

  constructor(
    private readonly addExpectation: (exp: Expectation) => void,
    private readonly addMember: (name: string) => void,
  ) {}

  hasClass(name: string): TypeScriptBuilder<TMembers> {
    this.addExpectation({ type: "class", name })
    this.currentClass = name
    this.currentInterface = null
    return this
  }

  hasInterface(name: string): TypeScriptBuilder<TMembers> {
    this.addExpectation({ type: "interface", name })
    this.currentInterface = name
    this.currentClass = null
    return this
  }

  withFunction<N extends string>(name: N): TypeScriptBuilder<[...TMembers, N]> {
    this.addExpectation({ type: "function", name, className: this.currentClass! })
    this.addMember(name)
    return this as unknown as TypeScriptBuilderImpl<[...TMembers, N]>
  }

  withMethod<N extends string>(name: N): TypeScriptBuilder<[...TMembers, N]> {
    this.addExpectation({ type: "method", name, className: this.currentInterface! })
    this.addMember(name)
    return this as unknown as TypeScriptBuilderImpl<[...TMembers, N]>
  }

  compiles(): TypeScriptBuilder<TMembers> {
    this.addExpectation({ type: "compiles" })
    return this
  }

  implements(ref: InputRef): TypeScriptBuilder<TMembers> {
    this.addExpectation({ type: "implements", interfacePath: ref.path })
    return this
  }
}

export const typescript: Plugin<TypeScriptBuilder<[]>> = {
  name: "typescript",
  expectationTypes: TYPESCRIPT_TYPES,

  createBuilder(addExpectation, addMember) {
    return new TypeScriptBuilderImpl(addExpectation, addMember)
  },

  async runExpectations(ownExpectations, context) {
    return runTypeScriptExpectations(ownExpectations, context)
  },

  formatExpectations(expectations) {
    return expectations
      .map((exp) => {
        switch (exp.type) {
          case "class":
            return `A class named "${exp.name}" must exist`
          case "function":
            return `${exp.className} must have a method named "${exp.name}"`
          case "interface":
            return `An interface named "${exp.name}" must exist`
          case "method":
            return `${exp.className} must have a method named "${exp.name}"`
          case "compiles":
            return "The files must compile without TypeScript errors"
          case "implements":
            return `A class must implement an interface from "${exp.interfacePath}"`
          default:
            return null
        }
      })
      .filter((s): s is string => s !== null)
  },
}

function runTypeScriptExpectations(
  expectations: Expectation[],
  context: PluginRunContext,
): ExpectationResult[] {
  const results: ExpectationResult[] = []
  const { scopeFiles, root } = context

  // 1. Compilation
  const compilesExps = expectations.filter((e) => e.type === "compiles")
  if (compilesExps.length > 0) {
    const project = new Project({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 99 /* ScriptTarget.Latest */,
        module: 199 /* ModuleKind.NodeNext */,
        moduleResolution: 99 /* ModuleResolutionKind.NodeNext */,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      skipAddingFilesFromTsConfig: true,
    })

    for (const file of scopeFiles) {
      const absPath = resolve(root, file)
      if (existsSync(absPath)) project.addSourceFileAtPath(absPath)
    }

    const errors = project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCategory() === 1 /* Error */)

    if (errors.length === 0) {
      for (const exp of compilesExps) results.push({ expectation: exp, pass: true })
    } else {
      const messages = errors.map((d) => {
        const file = d.getSourceFile()
        const msg = d.getMessageText()
        const msgStr = typeof msg === "string" ? msg : msg.getMessageText()
        return file ? `${file.getBaseName()}:${d.getLineNumber()}: ${msgStr}` : msgStr
      })
      for (const exp of compilesExps) {
        results.push({
          expectation: exp,
          pass: false,
          error: `TypeScript compilation failed:\n${messages.join("\n")}`,
        })
      }
      return results
    }
  }

  // 2. AST queries
  const astExps = expectations.filter((e) =>
    ["class", "function", "interface", "method"].includes(e.type),
  )
  if (astExps.length > 0) {
    const project = new Project({ useInMemoryFileSystem: false })
    for (const file of scopeFiles) {
      const absPath = resolve(root, file)
      if (existsSync(absPath)) project.addSourceFileAtPath(absPath)
    }
    for (const exp of astExps) {
      const result = validateAst(exp, project, scopeFiles, root)
      results.push(result)
      if (!result.pass) return results
    }
  }

  // 3. Implements
  const implementsExps = expectations.filter((e) => e.type === "implements")
  if (implementsExps.length > 0) {
    const project = new Project({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 99,
        module: 199,
        moduleResolution: 99,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      skipAddingFilesFromTsConfig: true,
    })

    for (const file of scopeFiles) {
      const absPath = resolve(root, file)
      if (existsSync(absPath)) project.addSourceFileAtPath(absPath)
    }
    for (const exp of implementsExps) {
      if (exp.interfacePath) {
        const absPath = resolve(root, exp.interfacePath)
        if (existsSync(absPath)) project.addSourceFileAtPath(absPath)
      }
    }

    for (const exp of implementsExps) {
      const result = validateImplements(exp, project, scopeFiles, root)
      results.push(result)
      if (!result.pass) return results
    }
  }

  return results
}

function validateAst(
  exp: Expectation,
  project: Project,
  scopeFiles: string[],
  root: string,
): ExpectationResult {
  switch (exp.type) {
    case "class": {
      for (const file of scopeFiles) {
        const sf = project.getSourceFile(resolve(root, file))
        if (sf?.getClass(exp.name!)) return { expectation: exp, pass: true }
      }
      return {
        expectation: exp,
        pass: false,
        error: `Class "${exp.name}" not found in scope files: ${scopeFiles.join(", ")}`,
      }
    }
    case "function": {
      for (const file of scopeFiles) {
        const sf = project.getSourceFile(resolve(root, file))
        if (sf?.getClass(exp.className!)?.getMethod(exp.name!))
          return { expectation: exp, pass: true }
      }
      return {
        expectation: exp,
        pass: false,
        error: `Method "${exp.name}" not found on class "${exp.className}"`,
      }
    }
    case "interface": {
      for (const file of scopeFiles) {
        const sf = project.getSourceFile(resolve(root, file))
        if (sf?.getInterface(exp.name!)) return { expectation: exp, pass: true }
      }
      return {
        expectation: exp,
        pass: false,
        error: `Interface "${exp.name}" not found in scope files: ${scopeFiles.join(", ")}`,
      }
    }
    case "method": {
      for (const file of scopeFiles) {
        const sf = project.getSourceFile(resolve(root, file))
        if (sf?.getInterface(exp.className!)?.getMethod(exp.name!))
          return { expectation: exp, pass: true }
      }
      return {
        expectation: exp,
        pass: false,
        error: `Method "${exp.name}" not found on interface "${exp.className}"`,
      }
    }
    default:
      return { expectation: exp, pass: true }
  }
}

function validateImplements(
  exp: Expectation,
  project: Project,
  scopeFiles: string[],
  root: string,
): ExpectationResult {
  if (!exp.interfacePath) {
    return { expectation: exp, pass: false, error: "implements: no interface path provided" }
  }

  const ifaceSf = project.getSourceFile(resolve(root, exp.interfacePath))
  if (!ifaceSf) {
    return {
      expectation: exp,
      pass: false,
      error: `Interface file "${exp.interfacePath}" not found`,
    }
  }

  const interfaces = ifaceSf.getInterfaces()
  if (interfaces.length === 0) {
    return {
      expectation: exp,
      pass: false,
      error: `No interfaces found in "${exp.interfacePath}"`,
    }
  }

  for (const file of scopeFiles) {
    const sf = project.getSourceFile(resolve(root, file))
    if (!sf) continue

    for (const cls of sf.getClasses()) {
      for (const impl of cls.getImplements()) {
        const implName = impl.getExpression().getText()
        for (const iface of interfaces) {
          if (implName === iface.getName()) {
            const implErrors = project
              .getPreEmitDiagnostics()
              .filter((d) => {
                const dSf = d.getSourceFile()
                return dSf?.getFilePath() === sf.getFilePath()
              })
              .filter((d) => {
                const msg = d.getMessageText()
                const s = typeof msg === "string" ? msg : msg.getMessageText()
                return s.includes(iface.getName()!)
              })

            if (implErrors.length === 0) return { expectation: exp, pass: true }

            return {
              expectation: exp,
              pass: false,
              error:
                `Class "${cls.getName()}" does not correctly implement interface "${iface.getName()}":\n` +
                implErrors
                  .map((d) => {
                    const msg = d.getMessageText()
                    return typeof msg === "string" ? msg : msg.getMessageText()
                  })
                  .join("\n"),
            }
          }
        }
      }
    }
  }

  return {
    expectation: exp,
    pass: false,
    error: `No class in scope files implements any interface from "${exp.interfacePath}" (interfaces: ${interfaces.map((i) => i.getName()).join(", ")})`,
  }
}
