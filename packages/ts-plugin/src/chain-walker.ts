import type ts from "typescript/lib/tsserverlibrary"

export interface ArtifactDeclaration {
  variableName: string
  memberNames: string[]
}

/**
 * Parse a source file and extract all artifact declarations:
 * `const X = await w.scope(...).act(...).withFunction("name").build()`
 *
 * Returns one ArtifactDeclaration per `await ...build()` variable.
 */
export function extractArtifactDeclarations(
  typescript: typeof import("typescript/lib/tsserverlibrary"),
  sourceFile: ts.SourceFile,
): ArtifactDeclaration[] {
  const results: ArtifactDeclaration[] = []

  function visit(node: ts.Node) {
    if (
      typescript.isVariableDeclaration(node) &&
      typescript.isIdentifier(node.name) &&
      node.initializer
    ) {
      const buildCall = unwrapAwait(typescript, node.initializer)
      if (buildCall) {
        const memberNames = extractMemberNamesFromChain(typescript, buildCall)
        if (memberNames !== null) {
          results.push({
            variableName: node.name.text,
            memberNames,
          })
        }
      }
    }

    typescript.forEachChild(node, visit)
  }

  visit(sourceFile)
  return results
}

function unwrapAwait(
  typescript: typeof import("typescript/lib/tsserverlibrary"),
  expr: ts.Expression,
): ts.CallExpression | null {
  while (typescript.isParenthesizedExpression(expr)) {
    expr = expr.expression
  }

  if (typescript.isAwaitExpression(expr)) {
    expr = expr.expression
    while (typescript.isParenthesizedExpression(expr)) {
      expr = expr.expression
    }
  }

  if (typescript.isCallExpression(expr)) {
    return expr
  }

  return null
}

function extractMemberNamesFromChain(
  typescript: typeof import("typescript/lib/tsserverlibrary"),
  callExpr: ts.CallExpression,
): string[] | null {
  const names: string[] = []
  let current: ts.Expression = callExpr
  let foundBuild = false

  while (typescript.isCallExpression(current)) {
    const expr = current.expression
    if (!typescript.isPropertyAccessExpression(expr)) break

    const methodName = expr.name.text

    if (methodName === "build") {
      foundBuild = true
      current = expr.expression
      continue
    }

    if (methodName === "withFunction" || methodName === "withMethod") {
      const arg = current.arguments[0]
      if (arg && typescript.isStringLiteral(arg)) {
        names.push(arg.text)
      }
    }

    current = expr.expression
  }

  if (!foundBuild) return null
  return names
}
