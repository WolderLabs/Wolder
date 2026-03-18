import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { Project } from "ts-morph"
import type { Expectation } from "./types.js"

export interface ExpectationResult {
  expectation: Expectation
  pass: boolean
  error?: string
}

export function runExpectations(
  expectations: Expectation[],
  scopeFiles: string[],
  root: string,
): ExpectationResult[] {
  const results: ExpectationResult[] = []

  // Group by validation order per spec section 6.3:
  // 1. expectFile (file existence)
  // 2. expectCompiles (not implemented yet — Phase 3.1)
  // 3. expectClass / expectInterface / withFunction / withMethod (AST queries)
  const fileExps = expectations.filter((e) => e.type === "file")
  const compilesExps = expectations.filter((e) => e.type === "compiles")
  const astExps = expectations.filter((e) =>
    ["class", "function", "interface", "method"].includes(e.type),
  )

  // 1. File existence checks
  for (const exp of fileExps) {
    const absPath = resolve(root, exp.path!)
    if (existsSync(absPath)) {
      results.push({ expectation: exp, pass: true })
    } else {
      results.push({
        expectation: exp,
        pass: false,
        error: `Expected file "${exp.path}" does not exist`,
      })
      return results // fail fast
    }
  }

  // 2. Compilation check via ts-morph
  if (compilesExps.length > 0) {
    const compileProject = new Project({
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
      if (existsSync(absPath)) {
        compileProject.addSourceFileAtPath(absPath)
      }
    }

    const diagnostics = compileProject.getPreEmitDiagnostics()
    const errors = diagnostics.filter(
      (d) => d.getCategory() === 1 /* DiagnosticCategory.Error */,
    )

    if (errors.length === 0) {
      for (const exp of compilesExps) {
        results.push({ expectation: exp, pass: true })
      }
    } else {
      const messages = errors.map((d) => {
        const file = d.getSourceFile()
        const line = d.getLineNumber()
        const msg = d.getMessageText()
        const msgStr = typeof msg === "string" ? msg : msg.getMessageText()
        const prefix = file ? `${file.getBaseName()}:${line}` : "unknown"
        return `${prefix}: ${msgStr}`
      })

      for (const exp of compilesExps) {
        results.push({
          expectation: exp,
          pass: false,
          error: `TypeScript compilation failed:\n${messages.join("\n")}`,
        })
      }
      return results // fail fast
    }
  }

  // 3. AST queries via ts-morph
  if (astExps.length > 0) {
    const project = new Project({ useInMemoryFileSystem: false })
    const absPaths = scopeFiles.map((f) => resolve(root, f))

    for (const absPath of absPaths) {
      if (existsSync(absPath)) {
        project.addSourceFileAtPath(absPath)
      }
    }

    for (const exp of astExps) {
      const result = validateAstExpectation(exp, project, scopeFiles, root)
      results.push(result)
      if (!result.pass) return results // fail fast
    }
  }

  return results
}

function validateAstExpectation(
  exp: Expectation,
  project: Project,
  scopeFiles: string[],
  root: string,
): ExpectationResult {
  switch (exp.type) {
    case "class": {
      for (const file of scopeFiles) {
        const sf = project.getSourceFile(resolve(root, file))
        if (sf?.getClass(exp.name!)) {
          return { expectation: exp, pass: true }
        }
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
        const cls = sf?.getClass(exp.className!)
        if (cls?.getMethod(exp.name!)) {
          return { expectation: exp, pass: true }
        }
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
        if (sf?.getInterface(exp.name!)) {
          return { expectation: exp, pass: true }
        }
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
        const iface = sf?.getInterface(exp.className!)
        if (iface?.getMethod(exp.name!)) {
          return { expectation: exp, pass: true }
        }
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
