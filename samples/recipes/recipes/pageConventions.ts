import type { Layer } from "@wolder/core"

// Tier 2 - conventions: (params) => (layer) => Layer.
export const pageConventions =
  (opts: { framework: "react" | "svelte"; router: string }) =>
  (layer: Layer): Layer =>
    layer.context(`
      ## Page conventions
      Pages are ${opts.framework} components routed by ${opts.router}.
      One page per file, named after its route. No data fetching inside components;
      pages receive data from a loader.
    `)
