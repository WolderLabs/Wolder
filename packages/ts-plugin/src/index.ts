import type ts from "typescript/lib/tsserverlibrary"
import { extractArtifactDeclarations } from "./chain-walker"
import { generateArtifactTypes } from "./generate-types"
import * as path from "path"
import * as fs from "fs"

function init(modules: { typescript: typeof ts }) {
  const typescript = modules.typescript

  function create(info: ts.server.PluginCreateInfo) {
    const logger = info.project.projectService.logger
    const projectDir = info.project.getCurrentDirectory()
    const outputPath = getOutputPath(info)

    logger.info("[wolder] Plugin initialized")

    // Generate on startup
    regenerateTypes(typescript, info, projectDir, outputPath, logger)

    // Proxy the language service to regenerate on file changes
    const proxy = Object.create(info.languageService) as ts.LanguageService

    // Regenerate when semantic diagnostics are requested (frequent, file-change-driven)
    const origGetSemanticDiagnostics = info.languageService.getSemanticDiagnostics.bind(
      info.languageService,
    )
    proxy.getSemanticDiagnostics = (fileName: string) => {
      if (isProgramFile(fileName, info)) {
        regenerateTypes(typescript, info, projectDir, outputPath, logger)
      }
      return origGetSemanticDiagnostics(fileName)
    }

    return proxy
  }

  return { create }
}

function getOutputPath(info: ts.server.PluginCreateInfo): string {
  const config = info.config as { outputPath?: string } | undefined
  const projectDir = info.project.getCurrentDirectory()
  return path.resolve(projectDir, config?.outputPath ?? "wolder.artifacts.d.ts")
}

function isProgramFile(fileName: string, info: ts.server.PluginCreateInfo): boolean {
  const config = info.config as { programFiles?: string[] } | undefined
  const programFiles = config?.programFiles ?? ["wolder.program.ts"]
  const baseName = path.basename(fileName)
  return programFiles.some((p) => baseName === p || fileName.endsWith(p))
}

function regenerateTypes(
  typescript: typeof ts,
  info: ts.server.PluginCreateInfo,
  projectDir: string,
  outputPath: string,
  logger: ts.server.Logger,
) {
  try {
    const config = info.config as { programFiles?: string[] } | undefined
    const programFiles = config?.programFiles ?? ["wolder.program.ts"]

    const allDeclarations: import("./chain-walker").ArtifactDeclaration[] = []

    for (const programFile of programFiles) {
      const fullPath = path.resolve(projectDir, programFile)
      if (!fs.existsSync(fullPath)) continue

      const content = fs.readFileSync(fullPath, "utf-8")
      const sourceFile = typescript.createSourceFile(
        fullPath,
        content,
        typescript.ScriptTarget.Latest,
        true,
      )

      const declarations = extractArtifactDeclarations(typescript, sourceFile)
      allDeclarations.push(...declarations)
    }

    const output = generateArtifactTypes(allDeclarations)

    // Only write if content changed to avoid unnecessary FS events
    const existing = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, "utf-8")
      : null
    if (existing !== output) {
      fs.writeFileSync(outputPath, output, "utf-8")
      logger.info(`[wolder] Generated ${outputPath} with ${allDeclarations.length} artifact(s)`)
    }
  } catch (err) {
    logger.info(`[wolder] Error generating types: ${err}`)
  }
}

export = init
