import { wolder } from "@wolder/core"
import { vitestConventions } from "@wolder/typescript"

const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
})

// One layer for the whole project. Deriving from it never moves it — `project`
// is the same value at the bottom of this file as it is here.
const project = w
  .layer()
  .apply(vitestConventions)
  .context(`
    A real-time chat app with authenticated users. Users sign up, log in, create
    and join named rooms, and exchange messages that appear instantly for everyone
    else in the room. Presence, message history and credentials all survive a
    server restart.
  `)
  .includeFile("chat-app-requirements.md")
  .gate("npx tsc --noEmit", { name: "typecheck" })

const backend = project.context(`
  Backend code, Node + TypeScript. Prefer async/await. Transport is WebSockets for
  live traffic and HTTP for auth. Persist to a local SQLite file so state survives
  a restart. Passwords are hashed and never appear in a response, a log or an error.
`)

const frontend = project.context(`
  Frontend code: React 19, function components and hooks only, no class components.
  The UI always makes the current room obvious, and new messages scroll into view.
`)

// The one agent allowed to touch package.json. Everyone who needs a library
// negotiates with it rather than reaching into the file.
const dependencies = project
  .scopedAgent()
  .canWrite("package.json")
  .act(`
    Initialise an NPM project for this app. Make reasonable library choices for an
    HTTP server, WebSockets, SQLite access, password hashing, React, and vitest.
    Pin real, current versions.
  `)
  .provides("NPM dependencies")

const readme = project
  .scopedAgent()
  .canWrite("README.md")
  .act(`
    Write the README: what the app is, how to install and run it, and how the
    pieces fit together.
  `)
  .provides("Documentation")

const auth = backend
  .scopedAgent()
  .canWrite("src/server/auth/")
  .requests(dependencies, "An HTTP framework, a session mechanism, and a password hashing library")
  .act(`
    Sign-up, log-in, log-out and session verification. Reject duplicate emails and
    bad credentials with clear messages. Logging out invalidates the session
    immediately and it can never be reused. Export middleware that protects a route.
    Credentials persist across a restart.
  `)
  .provides("Auth")

const rooms = backend
  .scopedAgent()
  .canWrite("src/server/rooms/")
  .uses(auth)
  .act(`
    Named room creation, browsing, joining and leaving, plus presence. Broadcast
    join and leave events to that room only. Keep an accurate active-user list
    across many joins and leaves. Handle a duplicate room name gracefully.
  `)
  .provides("Rooms and presence")

const messages = backend
  .scopedAgent()
  .canWrite("src/server/messages/")
  .uses(auth)
  .uses(rooms)
  .requests(readme, "Document how messages are persisted and replayed to a joining user")
  .act(`
    Sending, persisting and replaying messages. A message reaches every other user
    in the same room and nobody outside it. Blank messages are rejected. A user
    joining mid-conversation gets recent history in order. Nothing is lost on a
    restart, and nothing is duplicated after a reconnect.
  `)
  .provides("Messaging")

backend
  .scopedAgent()
  .canWrite("src/server/index.ts")
  .uses(auth)
  .uses(rooms)
  .uses(messages)
  .act(`
    The server entry point: wire auth, rooms and messaging together behind one
    HTTP and WebSocket server, and start it.
  `)
  .provides("Server")

frontend
  .scopedAgent()
  .canWrite("src/client/")
  .uses(auth)
  .uses(rooms)
  .uses(messages)
  .requests(dependencies, "React and a build tool that can serve the client")
  .act(`
    The browser app: sign-up and log-in screens, a room browser, and a room view
    with the message list, the active-user list and a composer. Sessions survive a
    page refresh. A brief disconnection reconnects automatically and rejoins the
    room the user was in.
  `)
  .provides("Web client")

await w.build()
