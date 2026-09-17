# Samples

Three programs, in increasing order of how much of v2 they exercise. Each one lives in a
directory that is *itself* the project being generated — the agents own the files there, so
almost everything you see after a run is generated. Only the program, its config, the
developer-owned inputs, and the requirements document are checked in.

Each sample needs an API key:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > samples/todo-service/.env
```

Run them from the repository root:

```bash
npm run sample:todo      # todo-service
npm run sample:counter   # counting-react-agent-based
npm run sample:chat      # chat-app-agent-based
```

## `todo-service`

The reference program, and the one v2 was designed against. Four agents on disjoint
regions, two `requests` edges and one `uses` edge:

- `README.md` provides Documentation
- `package.json` provides NPM dependencies
- `src/services/` provides the Todo Service, and **requests** README coverage
- `src/controllers/` provides the Todo API, **uses** the service, and **requests** a
  framework from the package agent

`src/models/TodoItem.ts` is developer-owned — included as context, inside nobody's region,
never written. Watch the contract phase: the controller never touches `package.json`, but
it ends up importing exactly the framework the package agent installed.

## `counting-react-agent-based`

The smallest interesting program: two agents that must agree on a public surface before
either writes a line, plus a layer **gate** (`npx tsc --noEmit`) that wolder runs over each
region and feeds back on failure.

## `chat-app-agent-based`

A realistic program built from a requirements document. Shows layer derivation doing real
work — one `project` layer, a `backend` and a `frontend` derived from it — and seven agents
across a server, a client, and the two files everybody needs a piece of.

`npx wolder agent` installs the Claude Code skill that writes a program like this one from
a requirements file.
