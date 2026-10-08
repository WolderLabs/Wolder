import type { Agent, AgentProvides, Layer } from "@wolder/core"

export interface PagesParams {
  entity: string // "Todo"
  route: string // "/todos"
  region: string // "src/pages/todos/"
  api: Agent<AgentProvides> // the agent whose output the pages consume
}

// Tier 3 - a recipe: (params) => (layer) => Agent. The region is a parameter because
// the one-owner invariant has to hold for every instantiation.
export const pages =
  ({ entity, route, region, api }: PagesParams) =>
  (layer: Layer) =>
    layer
      .agent()
      .owns(region)
      .after(api)
      .asks(api, `A typed client for the ${entity} API that the pages can import`)
      .goal(`
        Create the pages for ${entity} at ${route}:
        a list page, a detail page and an edit form.
        Use the ${entity} API exposed by the controller; do not call the service directly.
      `)
      .provides(`${entity} pages`)
