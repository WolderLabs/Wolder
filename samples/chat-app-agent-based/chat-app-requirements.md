# Real-Time Chat App with Authenticated Users
## Requirements

---

## Identity & Access

- A new user can sign up with an email and password
- A returning user can log in and receive a session that persists across page refreshes
- A logged-out user cannot access any chat features
- A user can log out, after which their session is immediately invalidated
- Passwords are never visible anywhere in the app, including logs or API responses

---

## Rooms & Presence

- A user can create a named chat room
- A user can browse and join any existing room
- When a user joins a room, other people in that room can see they've arrived
- When a user leaves or disconnects, others in the room are notified
- A room shows who is currently active in it at any given moment

---

## Messaging

- A user in a room can send a message and it appears instantly for everyone else in that room
- Messages from different users are visually distinguishable
- A user who joins a room mid-conversation can see recent message history
- Messages are not lost if the server restarts
- A user cannot send a blank message

---

## Resilience

- If a user loses their connection briefly, the app attempts to reconnect automatically
- If reconnection succeeds, they rejoin their previous room without having to navigate back

---

## Interface

- The app is usable in a standard web browser with no installation required
- The UI clearly shows which room the user is currently in
- New messages scroll into view automatically

---

## Testing Requirements

### Authentication Flows

- Signing up with valid credentials succeeds; signing up with a duplicate email is rejected
- Logging in with correct credentials succeeds; incorrect credentials are rejected with a clear message
- Accessing a protected route without a valid session is blocked and redirects appropriately
- A session cannot be reused after logout

### Messaging Behavior

- A message sent by one user is received by all other users in the same room
- A user in a different room does not receive messages from other rooms
- Sending a blank message is rejected before it reaches the server
- Message history is present and in the correct order when a new user joins a room

### Presence & Rooms

- Join and leave events are broadcast to the correct room only
- The active user list for a room is accurate after multiple users join and leave
- Creating a room with a duplicate name is handled gracefully

### Resilience

- A simulated disconnect followed by reconnect results in the user rejoining their room
- Messages sent during a brief disconnection are not duplicated on reconnect

### Persistence

- After a server restart, previously sent messages are still retrievable
- After a server restart, users can log back in with existing credentials
