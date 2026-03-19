declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  interface Database {
    exec(sql: string): this;
    prepare(sql: string): Statement;
    close(): void;
  }
  interface DatabaseConstructor {
    new (path: string): Database;
    (path: string): Database;
  }
  const Database: DatabaseConstructor;
  export = Database;
}

import Database = require("better-sqlite3");
import { User, Session, Room, Message } from "../models/types.js";

export class ChatDatabase {
  private db: Database.Database;

  constructor(path: string = "chat.db") {
    this.db = new Database(path);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id),
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        createdBy TEXT NOT NULL REFERENCES users(id),
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        roomId TEXT NOT NULL REFERENCES rooms(id),
        userId TEXT NOT NULL REFERENCES users(id),
        userEmail TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);
  }

  createUser(user: User): void {
    const stmt = this.db.prepare(
      `INSERT INTO users (id, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)`
    );
    stmt.run(user.id, user.email, user.passwordHash, user.createdAt);
  }

  findUserByEmail(email: string): User | undefined {
    const stmt = this.db.prepare(`SELECT * FROM users WHERE email = ?`);
    return stmt.get(email) as User | undefined;
  }

  findUserById(id: string): User | undefined {
    const stmt = this.db.prepare(`SELECT * FROM users WHERE id = ?`);
    return stmt.get(id) as User | undefined;
  }

  createSession(session: Session): void {
    const stmt = this.db.prepare(
      `INSERT INTO sessions (id, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`
    );
    stmt.run(session.id, session.userId, session.createdAt, session.expiresAt);
  }

  findSession(id: string): Session | undefined {
    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);
    return stmt.get(id) as Session | undefined;
  }

  deleteSession(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM sessions WHERE id = ?`);
    stmt.run(id);
  }

  deleteExpiredSessions(): void {
    const stmt = this.db.prepare(
      `DELETE FROM sessions WHERE expiresAt < ?`
    );
    stmt.run(new Date().toISOString());
  }

  createRoom(room: Room): void {
    const stmt = this.db.prepare(
      `INSERT INTO rooms (id, name, createdBy, createdAt) VALUES (?, ?, ?, ?)`
    );
    stmt.run(room.id, room.name, room.createdBy, room.createdAt);
  }

  findRoomByName(name: string): Room | undefined {
    const stmt = this.db.prepare(`SELECT * FROM rooms WHERE name = ?`);
    return stmt.get(name) as Room | undefined;
  }

  findRoomById(id: string): Room | undefined {
    const stmt = this.db.prepare(`SELECT * FROM rooms WHERE id = ?`);
    return stmt.get(id) as Room | undefined;
  }

  listRooms(): Room[] {
    const stmt = this.db.prepare(`SELECT * FROM rooms ORDER BY createdAt ASC`);
    return stmt.all() as Room[];
  }

  createMessage(message: Message): void {
    const stmt = this.db.prepare(
      `INSERT INTO messages (id, roomId, userId, userEmail, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      message.id,
      message.roomId,
      message.userId,
      message.userEmail,
      message.content,
      message.createdAt
    );
  }

  getMessagesByRoom(roomId: string, limit: number = 50): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages WHERE roomId = ? ORDER BY createdAt DESC LIMIT ?
      ) ORDER BY createdAt ASC
    `);
    return stmt.all(roomId, limit) as Message[];
  }

  close(): void {
    this.db.close();
  }
}

export function createDatabase(path?: string): ChatDatabase {
  return new ChatDatabase(path);
}