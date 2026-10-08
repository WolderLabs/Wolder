# Recipes

A reusable prompt is a function, and its parameters are its arguments. There is no
template language, no `{{entity}}` substitution and no registry of named prompts. Layers
and agents are immutable values, so a function that takes one and returns a derived one
is already the composition primitive. The pattern has three tiers, each a plain
TypeScript function. A working program is in `samples/recipes/`.

## Tier 1: fragments

`(params) => string`. Text that appears inside a goal or context. Ordinary template
literals; start here.

```ts
export const crudGoal = (entity: string) => `
  Create a ${entity}Service class providing CRUD operations for ${entity} objects.
  Use an in-memory Map<string, ${entity}> for storage. Generate UUIDs randomly.
`;
```

## Tier 2: conventions

`(params) => (layer: Layer) => Layer`. Context that applies to a whole subtree of the
program. `@wolder/typescript` ships one: `moduleConventions({ imports: "js" | "bare" })`.

```ts
export const pageConventions = (opts: { framework: "react" | "svelte"; router: string }) =>
  (layer: Layer) => layer.context(`
    ## Page conventions
    Pages are ${opts.framework} components routed by ${opts.router}.
    One page per file, named after its route. No data fetching inside components;
    pages receive data from a loader.
  `);

const web = project.apply(pageConventions({ framework: "react", router: "react-router" }));
```

## Tier 3: recipes

`(params) => (layer: Layer) => Agent`. A whole agent, parameterised. The region is a
parameter because the one-owner invariant must hold per instantiation; the entity drives
the goal; edges to other agents are passed in as values.

```ts
export interface PagesParams {
  entity: string;             // "Todo"
  route: string;              // "/todos"
  region: string;             // "src/pages/todos/"
  api: Agent<AgentProvides>;  // the agent whose output the pages consume
}

export const pages = ({ entity, route, region, api }: PagesParams) =>
  (layer: Layer) => layer.agent()
    .owns(region)
    .after(api)
    .asks(api, `A typed client for the ${entity} API that the pages can import`)
    .goal(`
      Create the pages for ${entity} at ${route}:
      a list page, a detail page and an edit form.
      Use the ${entity} API exposed by the controller; do not call the service directly.
    `)
    .provides(`${entity} pages`);

const todoPages = pages({ entity: "Todo", route: "/todos", region: "src/pages/todos/", api: todoController })(web);
const notePages = pages({ entity: "Note", route: "/notes", region: "src/pages/notes/", api: noteController })(web);
```

The result is an ordinary agent that the rest of the program can `after` and `asks` like
any other. For a recipe that adds context or an edge without owning a region, write an
`(agent: Agent) => Agent` function and use `Agent.apply`:
`layer.agent().owns(r).apply(withAccessibility).apply(withI18n({ locales }))`.

## A feature slice

A recipe can declare several agents and return them as a record.

```ts
export const crudFeature = (p: { entity: string; deps: Agent<AgentProvides> }) => (layer: Layer) => {
  const name = p.entity.toLowerCase();
  const service = layer.agent()
    .owns(`src/services/${p.entity}Service.ts`)
    .goal(crudGoal(p.entity))
    .provides(`${p.entity} service`);
  const controller = layer.agent()
    .owns(`src/controllers/${p.entity}Controller.ts`)
    .after(service)
    .asks(p.deps, "An HTTP framework")
    .goal(`...`)
    .provides(`${p.entity} API`);
  const ui = pages({ entity: p.entity, route: `/${name}s`, region: `src/pages/${name}/`, api: controller })(layer);
  return { service, controller, ui };
};
```

Instantiating it for `Todo` and `Note` gives six agents from one definition. Instantiating
a recipe twice with the same region is the usual overlap error; the message says so and
tells you to give each call its own region.

A recipe-produced agent hashes exactly like a hand-written one: region, goal text,
context and edges. Different parameters mean different cache keys, and changing a
recipe's goal template invalidates every instantiation.

## What the framework does not do

- No template engine. Interpolation is TypeScript's.
- No prompt registry or named lookup. Recipes are imported like any function.
- No `defineRecipe` helper. A recipe is `(params) => (layer) => Agent`; a wrapper would
  add a name and no capability.
- No partial application in the builder. `agent()` without `owns` is still not a node.
