import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { redis } from "../redis/config.js";
import { db } from "../db/index.js";
import { friends, friendRequests, players } from "../db/schema.js";
import { and, eq, or } from "drizzle-orm";
import { SERVER_EVENTS } from "./events.js";
import { string } from "zod";

interface JwtPayload {
  sub: string;   // player UUID
  gameId: string;
}

interface AuthenticatedSocket extends Socket {
  data: {
    playerId: string;
    gameId: string;
  };
}

let io: SocketServer | null = null;

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function setupWebSockets(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      credentials: true,
    },
    // Extra time to allow reconnection without losing the session
    pingTimeout: 30000,
  });

  // ---------------- AUTH MIDDLEWARE ----------------
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Client passes the JWT via `auth.token` during handshake.
      // For browsers using httpOnly cookies, we can also read it from the cookie header.
      const token =
        socket.handshake.auth?.token ||
        parseCookie(socket.handshake.headers.cookie, "playerToken");

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as JwtPayload;

      // Verify the session still exists in Redis (revocation check)
      const sessionKey = `session:${payload.sub}:${payload.gameId}`;
      const stored = await redis.get(sessionKey);
      if (stored !== token) {
        return next(new Error("Session expired or logged out"));
      }

      socket.data.playerId = payload.sub;
      socket.data.gameId = payload.gameId;

      next();
    } catch (err) {
      console.error("Socket auth error:", err);
      next(new Error("Invalid token"));
    }
  });

  // ---------------- CONNECTION HANDLER ----------------
  io.on("connection", async (socket: AuthenticatedSocket) => {
    const { playerId, gameId } = socket.data;
    console.log(`⚡ WS connected: player=${playerId} game=${gameId}`);

    // Join a private room so we can target this player specifically
    socket.join(`player:${playerId}`);

    // Track online status in Redis (with TTL to clean up dead sockets)
    await redis.set(`online:${gameId}:${playerId}`, "1", "EX", 60);

    // Broadcast "online" status to all friends of this player
    await broadcastToFriends(gameId, playerId, SERVER_EVENTS.FRIEND_ONLINE, {
      playerId,
    });

    // On connect, send initial sync state (online friends + pending requests)
    try {
      const friendIds = await getFriendIds(gameId, playerId);
      const onlineFriendIds = friendIds.length
        ? await redis.mget(
            friendIds.map((id) => `online:${gameId}:${id}`),
          )
        : [];

      const onlineFriends = friendIds.filter((_, i) => onlineFriendIds[i]);

      const pendingRequests = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.gameId, gameId),
            eq(friendRequests.receiverId, playerId),
            eq(friendRequests.status, "pending"),
          ),
        );

      socket.emit(SERVER_EVENTS.SYNC, {
        onlineFriends,
        pendingRequests,
      });
    } catch (err) {
      console.error("Error during sync:", err);
    }

    // ---------------- DISCONNECT ----------------
    socket.on("disconnect", async () => {
      console.log(`⚡ WS disconnected: player=${playerId}`);
      await redis.del(`online:${gameId}:${playerId}`);

      await broadcastToFriends(
        gameId,
        playerId,
        SERVER_EVENTS.FRIEND_OFFLINE,
        { playerId },
      );
    });
  });

  return io;
}

// ---------------- HELPERS ----------------

async function getFriendIds(gameId: string, playerId: string): Promise<string[]> {
  const rows = await db
    .select({
      playerAId: friends.playerAId,
      playerBId: friends.playerBId,
    })
    .from(friends)
    .where(
      and(
        eq(friends.gameId, gameId),
        or(eq(friends.playerAId, playerId), eq(friends.playerBId, playerId)),
      ),
    );

  return rows.map((r) =>
    r.playerAId === playerId ? r.playerBId : r.playerAId,
  );
}

async function broadcastToFriends(
  gameId: string,
  playerId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  if (!io) return;
  const friendIds = await getFriendIds(gameId, playerId);
  for (const fid of friendIds) {
    io.to(`player:${fid}`).emit(event, payload);
  }
}

function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));

  if (!match) return undefined;

  const value = match.split("=")[1];
  return value ? decodeURIComponent(value) : undefined;
}