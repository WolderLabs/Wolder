import { resolve } from "node:path"
import { wolder } from "@wolder/core"
import { typescriptConventions } from "@wolder/typescript"
import { pageConventions } from "./recipes/pageConventions.js"
import { crudFeature } from "./recipes/crudFeature.js"

// The generated project is ./project; see samples/README.md for why.
const w = wolder({
  root: resolve(import.meta.dirname, "project"),
  model: "claude-sonnet-4-6",
})

const project = w
  .layer()
  .apply(typescriptConventions)
  .apply(pageConventions({ framework: "react", router: "react-router" }))
  .context(`This project is a small web app with Todo and Note features.`)
  .include("src/models/Todo.ts")
  .include("src/models/Note.ts")

const deps = project
  .agent()
  .owns("package.json")
  .owns("tsconfig.json")
  .goal(`
    Initialize an NPM project with the necessary dependencies, and a matching strict
    ESM tsconfig.json. Make assumptions about library selection as needed.
  `)
  .provides("NPM dependencies and TypeScript config")

// One recipe, two instantiations: six agents from one definition.
crudFeature({ entity: "Todo", deps })(project)
crudFeature({ entity: "Note", deps })(project)

await w.run()
