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
  const implementsExps = expectations.filter((e) => e.type === "implements")

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

  // 4. Semantic implements check via ts-morph type checker
  if (implementsExps.length > 0) {
    const implProject = new Project({
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

    // Add scope files and interface files
    for (const file of scopeFiles) {
      const absPath = resolve(root, file)
      if (existsSync(absPath)) {
        implProject.addSourceFileAtPath(absPath)
      }
    }
    for (const exp of implementsExps) {
      if (exp.interfacePath) {
        const absPath = resolve(root, exp.interfacePath)
        if (existsSync(absPath)) {
          implProject.addSourceFileAtPath(absPath)
        }
      }
    }

    for (const exp of implementsExps) {
      const result = validateImplements(exp, implProject, scopeFiles, root)
      results.push(result)
      if (!result.pass) return results
    }
  }

  return results
}

function validateImplements(
  exp: Expectation,
  project: Project,
  scopeFiles: string[],
  root: string,
): ExpectationResult {
  if (!exp.interfacePath) {
    return {
      expectation: exp,
      pass: false,
      error: "expectImplements: no interface path provided",
    }
  }

  // Find the interface in the interface file
  const ifaceAbsPath = resolve(root, exp.interfacePath)
  const ifaceSf = project.getSourceFile(ifaceAbsPath)
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

  // Check each class in scope files for implements clause
  for (const file of scopeFiles) {
    const sf = project.getSourceFile(resolve(root, file))
    if (!sf) continue

    for (const cls of sf.getClasses()) {
      const implementsClauses = cls.getImplements()
      for (const impl of implementsClauses) {
        const implName = impl.getExpression().getText()
        for (const iface of interfaces) {
          if (implName === iface.getName()) {
            // Found a class that claims to implement the interface.
            // Use the type checker to verify it actually satisfies it.
            const diagnostics = project.getPreEmitDiagnostics().filter((d) => {
              const dSf = d.getSourceFile()
              return dSf && dSf.getFilePath() === sf.getFilePath()
            })
            const implErrors = diagnostics.filter((d) => {
              const msg = d.getMessageText()
              const msgStr = typeof msg === "string" ? msg : msg.getMessageText()
              return msgStr.includes(iface.getName()!)
            })

            if (implErrors.length === 0) {
              return { expectation: exp, pass: true }
            } else {
              const messages = implErrors.map((d) => {
                const msg = d.getMessageText()
                return typeof msg === "string" ? msg : msg.getMessageText()
              })
              return {
                expectation: exp,
                pass: false,
                error: `Class "${cls.getName()}" does not correctly implement interface "${iface.getName()}":\n${messages.join("\n")}`,
              }
            }
          }
        }
      }
    }
  }

  const ifaceNames = interfaces.map((i) => i.getName()).join(", ")
  return {
    expectation: exp,
    pass: false,
    error: `No class in scope files implements any interface from "${exp.interfacePath}" (interfaces: ${ifaceNames})`,
  }
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
