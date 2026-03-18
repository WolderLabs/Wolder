export interface ParsedFile {
  path: string
  content: string
}

const FILE_START = /^=== FILE:\s*(.+?)\s*===$/
const FILE_END = /^=== END FILE ===$/

export function parseGeneratedFiles(output: string): ParsedFile[] {
  const lines = output.split("\n")
  const files: ParsedFile[] = []
  let currentPath: string | null = null
  let currentLines: string[] = []

  for (const line of lines) {
    const startMatch = line.match(FILE_START)
    if (startMatch) {
      if (currentPath !== null) {
        // Close previous file if END FILE was missing
        files.push({ path: currentPath, content: currentLines.join("\n") })
      }
      currentPath = startMatch[1]!
      currentLines = []
      continue
    }

    if (FILE_END.test(line)) {
      if (currentPath !== null) {
        files.push({ path: currentPath, content: currentLines.join("\n") })
        currentPath = null
        currentLines = []
      }
      continue
    }

    if (currentPath !== null) {
      currentLines.push(line)
    }
  }

  // Handle unclosed final file
  if (currentPath !== null) {
    files.push({ path: currentPath, content: currentLines.join("\n") })
  }

  return files
}
