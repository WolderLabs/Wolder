import type { WolderOptions, WolderInstance, InputRef, ScopeBuilder } from "./types.js"
import { ScopeBuilderImpl } from "./chain.js"

export function wolder(options: WolderOptions): WolderInstance {
  return {
    input(path: string): InputRef {
      return { path, kind: "input" }
    },
    scope(path: string): ScopeBuilder {
      return new ScopeBuilderImpl(path, options.root, options.model)
    },
  }
}
