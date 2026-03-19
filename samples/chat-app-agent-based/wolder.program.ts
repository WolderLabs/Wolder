import { wolder, typescript, tests } from "@wolder/typescript-testing"
import { webPage } from "@wolder/browser"

const w = wolder({
  root: import.meta.dirname,
  model: "claude-sonnet-4-6",
})

// ---------------------------------------------------------------------------
// Step 1: Shared types / models
// ---------------------------------------------------------------------------

const types = await w
  .scope("src/models/types.ts")
  .act(`
    Define the following TypeScript interfaces and types for a real-time chat app:

    - User: { id: string; email: string; passwordHash: string; createdAt: string }
    - Session: { id: string; userId: string; createdAt: string; expiresAt: string }
    - Room: { id: string; name: string; createdBy: string; createdAt: string }
    - Message: { id: string; roomId: string; userId: string; userEmail: string; content: string; createdAt: string }
    - ActiveUser: { userId: string; email: string } — represents a user currently present in a room

    Also export a type:
    - SocketEventMap — a record of event names to payload types used with Socket.IO:
      - "chat:message" → { roomId: string; content: string }
      - "chat:messageReceived" → Message
      - "room:join" → { roomId: string }
      - "room:leave" → { roomId: string }
      - "room:userJoined" → { roomId: string; user: ActiveUser }
      - "room:userLeft" → { roomId: string; user: ActiveUser }
      - "room:activeUsers" → { roomId: string; users: ActiveUser[] }
      - "error" → { message: string }

    Export all interfaces and types.
  `)
  .expect(typescript, (e) =>
    e.hasInterface("User")
     .hasInterface("Session")
     .hasInterface("Room")
     .hasInterface("Message")
     .hasInterface("ActiveUser")
     .compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 2: Database layer — SQLite for persistence across restarts
// ---------------------------------------------------------------------------

const database = await w
  .scope("src/db/database.ts")
  .act(`
    Create a Database class that wraps better-sqlite3 to provide persistent storage
    for users, sessions, rooms, and messages.

    Constructor accepts an optional file path (default: "chat.db").
    Call .initialize() in the constructor to create tables if they don't exist.

    Tables:
      users    (id TEXT PK, email TEXT UNIQUE, passwordHash TEXT, createdAt TEXT)
      sessions (id TEXT PK, userId TEXT FK→users, createdAt TEXT, expiresAt TEXT)
      rooms    (id TEXT PK, name TEXT UNIQUE, createdBy TEXT FK→users, createdAt TEXT)
      messages (id TEXT PK, roomId TEXT FK→rooms, userId TEXT FK→users, userEmail TEXT, content TEXT, createdAt TEXT)

    Methods (all synchronous since better-sqlite3 is sync):
      - createUser(user: User): void
      - findUserByEmail(email: string): User | undefined
      - findUserById(id: string): User | undefined
      - createSession(session: Session): void
      - findSession(id: string): Session | undefined
      - deleteSession(id: string): void
      - deleteExpiredSessions(): void
      - createRoom(room: Room): void
      - findRoomByName(name: string): Room | undefined
      - findRoomById(id: string): Room | undefined
      - listRooms(): Room[]
      - createMessage(message: Message): void
      - getMessagesByRoom(roomId: string, limit?: number): Message[]  — default limit 50, ordered oldest first
      - close(): void

    Import types from "../models/types.js".
    Import BetterSqlite3 as: import Database from "better-sqlite3".
    Name the class ChatDatabase to avoid conflict with the better-sqlite3 import.
    Export an instance factory: export function createDatabase(path?: string): ChatDatabase.
  `)
  .withInput(types)
  .expect(typescript, (e) =>
    e.hasClass("ChatDatabase")
     .withFunction("createUser")
     .withFunction("findUserByEmail")
     .withFunction("findUserById")
     .withFunction("createSession")
     .withFunction("findSession")
     .withFunction("deleteSession")
     .withFunction("createRoom")
     .withFunction("findRoomByName")
     .withFunction("listRooms")
     .withFunction("createMessage")
     .withFunction("getMessagesByRoom")
     .withFunction("close")
     .compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 3: Auth service
// ---------------------------------------------------------------------------

const authService = await w
  .scope("src/services/authService.ts")
  .act(`
    Create an AuthService class for user authentication.

    Constructor takes a ChatDatabase instance.

    Methods:
      - async signup(email: string, password: string): Promise<{ user: Omit<User, "passwordHash">; sessionId: string }>
        Validate email is non-empty, password is >= 6 chars.
        Hash password with bcrypt (import from "bcrypt", 10 salt rounds).
        Generate user ID with crypto.randomUUID(). Create session (24h expiry).
        Throw Error if email already exists with message "Email already in use".

      - async login(email: string, password: string): Promise<{ user: Omit<User, "passwordHash">; sessionId: string }>
        Look up user by email, compare password with bcrypt.
        Throw Error "Invalid email or password" on failure.
        Create a new session (24h expiry) on success.

      - logout(sessionId: string): void
        Delete the session from DB.

      - validateSession(sessionId: string): User | null
        Look up session, check not expired, return user if valid.
        Delete expired sessions when found.

    Import ChatDatabase from "../db/database.js".
    Import types from "../models/types.js".
    Use crypto.randomUUID() for all ID generation.
    Never include passwordHash in returned user objects.
  `)
  .withInput(types)
  .withInput(database)
  .expect(typescript, (e) =>
    e.hasClass("AuthService")
     .withFunction("signup")
     .withFunction("login")
     .withFunction("logout")
     .withFunction("validateSession")
     .compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 4: Room service
// ---------------------------------------------------------------------------

const roomService = await w
  .scope("src/services/roomService.ts")
  .act(`
    Create a RoomService class for room management and presence tracking.

    Constructor takes a ChatDatabase instance.

    Use an in-memory Map<string, Set<string>> called "activeUsers" to track which
    userIds are in each roomId. Use another Map<string, ActiveUser> called "userInfo"
    to cache userId → { userId, email }.

    Methods:
      - createRoom(name: string, createdBy: string): Room
        Generate ID with crypto.randomUUID().
        Throw Error "Room name already exists" if duplicate.
        Return the created Room.

      - listRooms(): Room[]
        Return all rooms from DB.

      - getRoom(id: string): Room | undefined
        Return room by ID from DB.

      - joinRoom(roomId: string, userId: string, email: string): void
        Add user to the in-memory activeUsers set for that room.
        Cache the user info in userInfo map.

      - leaveRoom(roomId: string, userId: string): ActiveUser | undefined
        Remove user from activeUsers set. Return the ActiveUser info if they were present.

      - leaveAllRooms(userId: string): Array<{ roomId: string; user: ActiveUser }>
        Remove user from all rooms. Return list of roomId + user pairs for broadcasting.

      - getActiveUsers(roomId: string): ActiveUser[]
        Return all active users in a room.

    Import ChatDatabase from "../db/database.js".
    Import types from "../models/types.js".
  `)
  .withInput(types)
  .withInput(database)
  .expect(typescript, (e) =>
    e.hasClass("RoomService")
     .withFunction("createRoom")
     .withFunction("listRooms")
     .withFunction("getRoom")
     .withFunction("joinRoom")
     .withFunction("leaveRoom")
     .withFunction("leaveAllRooms")
     .withFunction("getActiveUsers")
     .compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 5: Message service
// ---------------------------------------------------------------------------

const messageService = await w
  .scope("src/services/messageService.ts")
  .act(`
    Create a MessageService class for chat message management.

    Constructor takes a ChatDatabase instance.

    Methods:
      - sendMessage(roomId: string, userId: string, userEmail: string, content: string): Message
        Validate content is non-empty (trimmed), throw Error "Message cannot be blank" otherwise.
        Generate ID with crypto.randomUUID(), set createdAt to new Date().toISOString().
        Persist to DB, return the Message.

      - getHistory(roomId: string, limit?: number): Message[]
        Return recent messages for a room (default 50), oldest first.

    Import ChatDatabase from "../db/database.js".
    Import types from "../models/types.js".
  `)
  .withInput(types)
  .withInput(database)
  .expect(typescript, (e) =>
    e.hasClass("MessageService")
     .withFunction("sendMessage")
     .withFunction("getHistory")
     .compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 6: Socket.IO handlers
// ---------------------------------------------------------------------------

const socketHandlers = await w
  .scope("src/socket/handlers.ts")
  .act(`
    Create and export a function:
      export function registerSocketHandlers(
        io: Server,
        authService: AuthService,
        roomService: RoomService,
        messageService: MessageService
      ): void

    Use Socket.IO (import { Server, Socket } from "socket.io").

    On connection:
      1. Authenticate: read the "sessionId" from socket.handshake.auth.
         Call authService.validateSession(sessionId).
         If invalid, emit "error" with { message: "Authentication required" } and disconnect.
         Store userId and email on socket.data.

      2. Register event handlers on the authenticated socket:

        "room:join" → ({ roomId }):
          - socket.join(roomId)
          - roomService.joinRoom(roomId, userId, email)
          - Store the current roomId on socket.data.currentRoomId
          - Emit "room:userJoined" to all in room (including sender)
          - Emit "room:activeUsers" to all in room
          - Send message history: emit "chat:history" → Message[] to the joining socket only

        "room:leave" → ({ roomId }):
          - socket.leave(roomId)
          - roomService.leaveRoom(roomId, userId) → get the ActiveUser
          - Clear socket.data.currentRoomId
          - Emit "room:userLeft" to the room
          - Emit "room:activeUsers" to the room

        "chat:message" → ({ roomId, content }):
          - Validate content is not blank; if blank, emit "error" { message: "Message cannot be blank" } and return
          - messageService.sendMessage(roomId, userId, email, content)
          - Emit "chat:messageReceived" to all in room (including sender)

      3. On "disconnect":
        - roomService.leaveAllRooms(userId)
        - For each room the user was in, emit "room:userLeft" and "room:activeUsers" to that room

    Import AuthService from "../services/authService.js".
    Import RoomService from "../services/roomService.js".
    Import MessageService from "../services/messageService.js".
    Import types from "../models/types.js".
  `)
  .withInput(types)
  .withInput(authService)
  .withInput(roomService)
  .withInput(messageService)
  .expect(typescript, (e) =>
    e.withFunction("registerSocketHandlers")
     .compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 7: Express server with REST auth routes + Socket.IO
// ---------------------------------------------------------------------------

const server = await w
  .scope("src/server.ts")
  .act(`
    Create the main server entry point using Express and Socket.IO.

    Setup:
      - Create an Express app and http.createServer.
      - Attach Socket.IO with cors: { origin: "*" }.
      - Use express.json() middleware.
      - Serve static files from path.join(import.meta.dirname, "public").
      - Instantiate ChatDatabase (use env DATABASE_PATH or "chat.db").
      - Instantiate AuthService, RoomService, MessageService with the database.
      - Call registerSocketHandlers(io, authService, roomService, messageService).

    REST API routes:

      POST /api/auth/signup — body: { email, password }
        Call authService.signup. Return 201 { user, sessionId }.
        On error, return 400 { error: message }.

      POST /api/auth/login — body: { email, password }
        Call authService.login. Return 200 { user, sessionId }.
        On error, return 401 { error: message }.

      POST /api/auth/logout — body: { sessionId }
        Call authService.logout. Return 200 { ok: true }.

      GET /api/auth/me — header "Authorization: Bearer <sessionId>"
        Call authService.validateSession. Return 200 { user } or 401 { error }.

      GET /api/rooms — header "Authorization: Bearer <sessionId>"
        Validate session. Return 200 { rooms: roomService.listRooms() }.

      POST /api/rooms — header "Authorization: Bearer <sessionId>", body: { name }
        Validate session. Call roomService.createRoom. Return 201 { room } or 400 { error }.

    Auth middleware helper: extract sessionId from "Authorization: Bearer ..." header,
    validate, attach user to request. Use for protected routes.

    Catch-all: serve index.html for any non-API GET request (SPA fallback).

    Listen on PORT env var or 3000. Log "listening on port <port>" when ready.

    Handle SIGINT/SIGTERM: close database, exit.

    Import registerSocketHandlers from "./socket/handlers.js".
    Import { createDatabase } from "./db/database.js".
    Import AuthService from "./services/authService.js".
    Import RoomService from "./services/roomService.js".
    Import MessageService from "./services/messageService.js".
  `)
  .withInput(types)
  .withInput(database)
  .withInput(authService)
  .withInput(roomService)
  .withInput(messageService)
  .withInput(socketHandlers)
  .expect(typescript, (e) =>
    e.compiles()
  )
  .build()

// ---------------------------------------------------------------------------
// Step 8: Frontend — HTML + CSS + JS client
// ---------------------------------------------------------------------------

const frontendHtml = await w
  .scope("src/public/index.html")
  .act(`
    Create a single-page chat app HTML file. It should include inline CSS in a <style> tag
    and reference app.js via <script src="app.js"></script> at the end of the body.

    The page layout has three main views, shown/hidden via JS:

    1. Auth view (#auth-view): centered card with tabs for "Sign Up" and "Log In".
       Each tab shows a form with email + password inputs and a submit button.
       Show validation errors inline.

    2. Lobby view (#lobby-view): header with user email and logout button.
       A "Create Room" form (room name input + button).
       A list of available rooms, each clickable to join.

    3. Chat view (#chat-view): header showing room name, a "Back to Lobby" button, user email, logout button.
       A sidebar or top bar showing active users in the room.
       A scrollable message list area (#messages) that auto-scrolls to bottom.
       Messages from the current user are styled differently (right-aligned, different color) from others (left-aligned).
       A message input form at the bottom with a text input and send button.

    Style: modern, clean design. Use a color scheme with a primary blue (#4A90D9),
    light gray backgrounds, white cards, subtle shadows. Responsive for mobile.
    Messages should have the sender's email, timestamp, and content.

    Include the Socket.IO client script: <script src="/socket.io/socket.io.js"></script>
    before app.js.
  `)
  .expectFile("src/public/index.html")
  .build()

const frontendJs = await w
  .scope("src/public/app.js")
  .act(`
    Create the client-side JavaScript for the chat app. This is a vanilla JS file (no framework).
    Assume Socket.IO client is available globally as "io" and the HTML structure from index.html.

    State management:
      - Store sessionId and user in memory. Also persist sessionId to localStorage for page refresh.
      - On page load, check localStorage for sessionId, call GET /api/auth/me to validate.
        If valid, show lobby. Otherwise show auth view.

    Auth functions:
      - signup(email, password): POST /api/auth/signup → store session, show lobby
      - login(email, password): POST /api/auth/login → store session, show lobby
      - logout(): POST /api/auth/logout → clear session + localStorage, disconnect socket, show auth view

    Socket connection:
      - Connect after successful auth: io({ auth: { sessionId } })
      - On "connect_error", if auth-related, force logout
      - On "disconnect", show a reconnecting indicator
      - On "connect" after a disconnect, if we had a currentRoomId, re-emit "room:join"

    Lobby functions:
      - loadRooms(): GET /api/rooms → render room list
      - createRoom(name): POST /api/rooms → reload room list
      - joinRoom(roomId, roomName): emit "room:join", switch to chat view

    Chat functions:
      - Listen for "chat:messageReceived" → append message to #messages, auto-scroll
      - Listen for "chat:history" → render all history messages, auto-scroll
      - Listen for "room:userJoined" / "room:userLeft" → show system message in chat
      - Listen for "room:activeUsers" → update active users display
      - sendMessage(content): validate not blank, emit "chat:message"
      - leaveRoom(): emit "room:leave", switch to lobby view, reload rooms

    UI helpers:
      - showView(viewId): hide all views, show the specified one
      - renderMessage(message, isOwnMessage): create DOM element with sender, time, content
      - scrollToBottom(): scroll #messages to bottom
      - showError(element, message): display inline error

    Wire up all form submissions with event listeners (prevent default).
    Add a "reconnecting..." banner that shows when socket is disconnected.
  `)
  .withInput(frontendHtml)
  .expectFile("src/public/app.js")
  .build()

// ---------------------------------------------------------------------------
// Step 9: Tests — Auth flows
// ---------------------------------------------------------------------------

const authTests = await w
  .scope("src/__tests__/auth.test.ts")
  .act(`
    Write vitest tests for AuthService covering:

    1. "signup with valid credentials creates user and session"
    2. "signup with duplicate email throws 'Email already in use'"
    3. "login with correct credentials returns user and session"
    4. "login with wrong password throws 'Invalid email or password'"
    5. "login with non-existent email throws 'Invalid email or password'"
    6. "validateSession returns user for valid session"
    7. "validateSession returns null for invalid session ID"
    8. "validateSession returns null for expired session"
    9. "logout invalidates session — validateSession returns null after logout"

    Use an in-memory SQLite database by passing ":memory:" to createDatabase.
    Use beforeEach to create a fresh database and AuthService instance.
    Use afterEach to close the database.

    Import { createDatabase } from "../db/database.js".
    Import { AuthService } from "../services/authService.js".
  `)
  .withInput(types)
  .withInput(database)
  .withInput(authService)
  .expect(tests, (e) => e)
  .build()

// ---------------------------------------------------------------------------
// Step 10: Tests — Message behavior
// ---------------------------------------------------------------------------

const messageTests = await w
  .scope("src/__tests__/messageService.test.ts")
  .act(`
    Write vitest tests for MessageService covering:

    1. "sendMessage persists and returns a message with all fields"
    2. "sendMessage with blank content throws 'Message cannot be blank'"
    3. "sendMessage with whitespace-only content throws 'Message cannot be blank'"
    4. "getHistory returns messages in chronological order (oldest first)"
    5. "getHistory respects limit parameter"
    6. "getHistory returns empty array for room with no messages"
    7. "messages persist across new MessageService instances using the same database"

    Use an in-memory SQLite database. Create necessary user and room records in beforeEach
    so foreign keys are satisfied. Use createDatabase(":memory:").

    Import { createDatabase } from "../db/database.js".
    Import { MessageService } from "../services/messageService.js".
    Import types as needed from "../models/types.js".
  `)
  .withInput(types)
  .withInput(database)
  .withInput(messageService)
  .expect(tests, (e) => e)
  .build()

// ---------------------------------------------------------------------------
// Step 11: Tests — Room & presence
// ---------------------------------------------------------------------------

const roomTests = await w
  .scope("src/__tests__/roomService.test.ts")
  .act(`
    Write vitest tests for RoomService covering:

    1. "createRoom creates and persists a room"
    2. "createRoom with duplicate name throws 'Room name already exists'"
    3. "listRooms returns all created rooms"
    4. "joinRoom adds user to active users list"
    5. "multiple users joining a room are all listed in getActiveUsers"
    6. "leaveRoom removes user from active users"
    7. "leaveRoom returns undefined for user not in room"
    8. "leaveAllRooms removes user from every room they joined"
    9. "getActiveUsers returns empty array for room with no users"

    Use an in-memory SQLite database. Create a user record in beforeEach so
    foreign keys are satisfied for room createdBy. Use createDatabase(":memory:").

    Import { createDatabase } from "../db/database.js".
    Import { RoomService } from "../services/roomService.js".
  `)
  .withInput(types)
  .withInput(database)
  .withInput(roomService)
  .expect(tests, (e) => e)
  .build()

// ---------------------------------------------------------------------------
// Step 12: Web page validation — confirm the app renders in a browser
// ---------------------------------------------------------------------------

await w
  .scope("src/public/index.html")
  .scope("src/public/app.js")
  .scope("src/server.ts")
  .act("Ensure the chat app frontend loads and displays the authentication view by default.")
  .withInput(server)
  .withInput(frontendHtml)
  .withInput(frontendJs)
  .expectWebPage("/", "shows a login/signup form with email and password fields")
  .build()
