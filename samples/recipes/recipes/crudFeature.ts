import type { Agent, AgentProvides, Layer } from "@wolder/core"
import { crudGoal } from "./crudGoal.js"
import { pages } from "./pages.js"

// A feature slice: one recipe that wires service -> controller -> pages for an entity.
export const crudFeature =
  (p: { entity: string; deps: Agent<AgentProvides> }) => (layer: Layer) => {
    const name = p.entity.toLowerCase()
    const service = layer
      .agent()
      .owns(`src/services/${p.entity}Service.ts`)
      .goal(crudGoal(p.entity))
      .provides(`${p.entity} service`)
    const controller = layer
      .agent()
      .owns(`src/controllers/${p.entity}Controller.ts`)
      .after(service)
      .asks(p.deps, "An HTTP framework")
      .goal(`
        Create a ${p.entity}Controller class that wraps ${p.entity}Service
        and provides a simple HTTP API.
      `)
      .provides(`${p.entity} API`)
    const ui = pages({
      entity: p.entity,
      route: `/${name}s`,
      region: `src/pages/${name}/`,
      api: controller,
    })(layer)
    return { service, controller, ui }
  }
