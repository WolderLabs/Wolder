# Wolder v3 — Vocabulary and reusable prompts

Status: **proposal**. Implementation guide: `PLAN-v3-impl.md`. Nothing here is implemented. `PLAN.md` is the v2 record and
still describes the code as it stands. This document covers two things that came
out of using v2: the DSL terms do not quite say what they mean, and there is no
pattern for a prompt that is written once and instantiated many times.

## 1. Vocabulary

The v2 pattern is right: a layer accumulates context, an agent owns a region and does
a job, edges say how agents relate, one `await` runs the graph. The names describe the
mechanism rather than the role, and the most-typed name (`scopedAgent`) is the worst.

| v2            | v3        | Why                                                                                  |
|---------------|-----------|--------------------------------------------------------------------------------------|
| `scopedAgent` | `agent`   | Every agent is scoped. The qualifier carries no information.                         |
| `canWrite`    | `owns`    | The invariant is *one owner per region*. "Can" reads as a permission, not ownership. |
| `act`         | `goal`    | It is what the agent is trying to achieve, phrased for the agent.                    |
| `uses`        | `after`   | This is the only ordering edge. The name should sound like ordering.                 |
| `requests`    | `asks`    | A negotiation, not an injection. "Asks" implies an answer is coming.                 |
| `includeFile` | `include` | The argument is a path; "file" is redundant.                                         |
| `build`       | `run`     | The graph is already built by the time this line executes.                           |
| `layer`, `apply`, `context`, `gate`, `provides` | unchanged | They already read as values and declarations. |

The reference program in v3 terms:

```ts
const project = w.layer()
  .apply(typescriptConventions)
  .context(`...`)
  .include("src/models/TodoItem.ts");

const readme = project.agent()
  .owns("README.md")
  .goal(`...`)
  .provides("Documentation");

const deps = project.agent()
  .owns("package.json")
  .owns("tsconfig.json")
  .goal(`...`)
  .provides("NPM dependencies and TypeScript config");

const todoService = project.agent()
  .owns("src/services/")
  .asks(readme, "Document Todo Service usage")
  .goal(`...`)
  .provides("Todo Service");

const todoController = project.agent()
  .owns("src/controllers/")
  .asks(deps, "A framework like Express.js for handling HTTP requests")
  .after(todoService)
  .goal(`...`)
  .provides("Todo API");

await w.run();
```

This is a rename, not a redesign. Types, invariants, pre-flight checks and the
manifest are untouched. The v2 names are removed, not aliased — one DSL, as before.

## 2. Reusable, composable, parameterized prompts

### The problem

A program that generates a Todo service, a Todo controller and Todo pages has three
agents whose goals differ only by entity name, route and region. A second program for
Notes repeats all three. Nothing in v2 stops a developer from writing a function that
returns an agent, but nothing shows them that this is *the* pattern, and the agent
builder lacks the one method that makes partial recipes compose.

### The principle

**A reusable prompt is a function, and parameters are its arguments.** There is no
template language, no `{{entity}}` substitution, no registry of named prompts. Layers
and agents are immutable values, so a function that takes one and returns a derived
one is already the composition primitive; `Layer.apply` exists for exactly this. The
pattern is three tiers of the same idea, each a plain TypeScript function.

#### Tier 1 — fragments: `(params) => string`

Text that appears inside a goal or context. Ordinary template literals.

```ts
export const crudGoal = (entity: string) => `
  Create a ${entity}Service class providing CRUD operations for ${entity} objects.
  Use an in-memory Map<string, ${entity}> for storage. Generate UUIDs randomly.
`;
```

Nothing to add to the framework. Mentioned so the docs can say "start here".

#### Tier 2 — conventions: `(params) => (layer: Layer) => Layer`

Context that applies to a whole subtree of the program. This is what
`@wolder/typescript` ships today, minus the parameters.

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

#### Tier 3 — recipes: `(params) => (layer: Layer) => Agent`

A whole agent, parameterized. This is the "todo pages" case. The region is a
parameter because the one-owner invariant must hold per instantiation; the entity
drives the goal; edges to other agents are passed in as values.

```ts
// recipes/pages.ts
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
```

Instantiation is one line per use, and the result is an ordinary agent that the rest
of the program can `after` and `asks` like any other:

```ts
const todoPages = pages({ entity: "Todo", route: "/todos", region: "src/pages/todos/", api: todoController })(web);
const notePages = pages({ entity: "Note", route: "/notes", region: "src/pages/notes/", api: noteController })(web);
```

A recipe can declare several agents and return them as a record. A "feature slice"
recipe that wires service → controller → pages for one entity is the natural next step
and needs nothing new:

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

### What the framework adds

Deliberately little. Each item below is justified by a recipe that cannot be written
cleanly without it.

1. **`Agent.apply(fn: (a: Agent) => Agent)`** — symmetry with `Layer.apply`. Lets a
   recipe return a *partial* agent transform (`(a: Agent) => Agent`) that adds context
   or an edge without owning the region, so two partial recipes compose on one agent:
   `layer.agent().owns(r).apply(withAccessibility).apply(withI18n({ locales }))`.
   Types: `apply` must preserve the `TProvides` brand when the function does.

2. **Pre-flight messages that know about recipes.** Instantiating the same recipe twice
   with the same `region` is the overlap error already caught by `graph.ts`. The message
   should say so in recipe terms: *"Two agents own `src/pages/todos/`. If both come from
   the same recipe, give each instantiation its own `region`."* No new check; a better
   sentence.

3. **A `samples/recipes` program** showing all three tiers, and `docs/recipes.md`.
   `@wolder/typescript` gains one parameterized tier-2 export so the shipped layer
   demonstrates the pattern rather than only the unparameterized form.

### What the framework does not add

- **No template engine.** Interpolation is TypeScript's. A `{{var}}` syntax would be a
  second language with no type checking and no editor support.
- **No prompt registry or named lookup.** Recipes are imported like any function.
  Discoverability is the module system's job.
- **No `defineRecipe` helper.** A recipe is `(params) => (layer) => Agent`. Wrapping
  that in a helper adds a name without adding a capability. Revisit only if recipes need
  identity for caching (see below).
- **No partial application in the builder.** `agent()` without `owns` is still not a
  node; the leaf rule in `program.ts` is unchanged.

### Caching

A recipe-produced agent hashes exactly like a hand-written one: region, goal text,
context, edges. Two instantiations with different params have different goals and so
different cache keys. Renaming a recipe's internal variable changes nothing. Changing a
recipe's goal template invalidates every instantiation, which is correct.

### Open questions

1. Should `provides` be able to carry the entity as structured data rather than a
   label, so `asks` can be checked against it? Out of scope here; the label works.
2. Whether a recipe that returns a record should also return a layer with the record's
   agents' context folded in, so downstream agents inherit it. Decide when a real
   program needs it.

## 3. Sequencing

1. Vocabulary rename across `src/`, packages, samples, docs, tests. One commit, no aliases.
2. `Agent.apply` with type tests for brand preservation.
3. Overlap error message in recipe terms, with a test that instantiates one recipe twice.
4. `samples/recipes` and `docs/recipes.md`; parameterized export in `@wolder/typescript`.
