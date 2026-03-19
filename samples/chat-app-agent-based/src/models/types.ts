export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  userEmail: string;
  content: string;
  createdAt: string;
}

export interface ActiveUser {
  userId: string;
  email: string;
}

export type SocketEventMap = {
  "chat:message": { roomId: string; content: string };
  "chat:messageReceived": Message;
  "room:join": { roomId: string };
  "room:leave": { roomId: string };
  "room:userJoined": { roomId: string; user: ActiveUser };
  "room:userLeft": { roomId: string; user: ActiveUser };
  "room:activeUsers": { roomId: string; users: ActiveUser[] };
  "error": { message: string };
};