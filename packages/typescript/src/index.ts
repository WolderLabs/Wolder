import type { Layer } from "@wolder/core";

/**
 * A shipped layer, not a plugin.
 *
 * Layers are reusable *values*, so a library's contribution to a program can be
 * an ordinary `Layer => Layer` function composed into the chain:
 *
 * ```ts
 * const project = w.layer().apply(typescriptConventions)
 * ```
 *
 * It only ever adds context, which is what keeps derivation predictable — a
 * program can specialise on top of these conventions but never silently lose them.
 */
export function typescriptConventions(layer: Layer): Layer {
  return layer.context(`
    ## TypeScript conventions

    Write modern, strict TypeScript.

    - ESM only. Every relative import carries a \`.js\` extension, because the
      project uses Node16 module resolution: \`import { X } from "./x.js"\`.
    - \`strict\` is on. No implicit \`any\`, no non-null assertions to paper over a
      type you have not thought about, no \`as any\` escape hatches.
    - Prefer \`const\`; use \`let\` only where reassignment is the point; never \`var\`.
    - \`import type\` for type-only imports.
    - Export one primary thing per module and name the file after it.
    - Model data with \`interface\` and \`type\`; prefer union types over enums.
    - Prefer \`async\`/\`await\` over raw promise chains or callbacks.
    - Throw \`Error\` subclasses with messages that say what went wrong and what to
      do about it. Do not swallow errors.
    - No dead code, no commented-out code, no placeholder implementations. Comment
      only where the reason for the code is not evident from the code.
  `);
}

/**
 * Conventions for a TypeScript project that is tested with vitest. Composes on
 * top of {@link typescriptConventions}.
 */
export function vitestConventions(layer: Layer): Layer {
  return typescriptConventions(layer).context(`
    ## Testing conventions

    Tests use vitest and live beside the code they cover as \`*.test.ts\`.

    - Cover behaviour, not implementation detail. One assertion subject per test.
    - Name tests as sentences describing the behaviour under test.
    - Mock anything that reaches the network or a real service; never call one in a test.
    - A test that needs a real filesystem uses \`mkdtempSync\` and cleans up after itself.
  `);
}
