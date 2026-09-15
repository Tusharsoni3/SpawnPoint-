import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { friends, friendRequests, players } from "../db/schema.js";
import { getIO } from "../socket/index.js";
import { SERVER_EVENTS } from "../socket/events.js";

// ============================================================
// POST /api/friends/request/:playerId
// ============================================================
export const sendFriendRequest = async (req: Request, res: Response) => {
  const senderId : any = req.playerId;                 // UUID from JWT
  const receiverId : any  = req.params.playerId;        // UUID from URL
  const gameId : any = req.gameId;

  if (senderId === receiverId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "You cannot send a friend request to yourself.",
    });
  }

  try {
    // Verify receiver exists in this game
    const [receiver] = await db
      .select({ id: players.id, displayName: players.displayName })
      .from(players)
      .where(and(eq(players.id, receiverId), eq(players.gameId, gameId)))
      .limit(1);

    if (!receiver) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Player not found.",
      });
    }

    // Already friends?
    const [existingFriend] = await db
      .select()
      .from(friends)
      .where(
        and(
          eq(friends.gameId, gameId),
          or(
            and(eq(friends.playerAId, senderId), eq(friends.playerBId, receiverId)),
            and(eq(friends.playerAId, receiverId), eq(friends.playerBId, senderId)),
          ),
        ),
      )
      .limit(1);

    if (existingFriend) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "You are already friends.",
      });
    }

    // Already a pending request?
    const [existingRequest] = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.gameId, gameId),
          eq(friendRequests.senderId, senderId),
          eq(friendRequests.receiverId, receiverId),
          eq(friendRequests.status, "pending"),
        ),
      )
      .limit(1);

    if (existingRequest) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "Friend request already pending.",
      });
    }

    // Insert (partial unique index protects against races)
    const [newRequest] : any= await db
      .insert(friendRequests)
      .values({ gameId, senderId, receiverId })
      .returning();

    // Fetch sender's public profile to send along
    const [senderProfile] = await db
      .select({
        id: players.id,
        displayName: players.displayName,
      })
      .from(players)
      .where(eq(players.id, senderId))
      .limit(1);


    getIO().to(`player:${receiverId}`).emit(
      SERVER_EVENTS.FRIEND_REQUEST_RECEIVED,
      {
        requestId: newRequest.id,
        sender: senderProfile,
        createdAt: newRequest.createdAt,
      },
    );

    return res.status(StatusCodes.CREATED).json(newRequest);
  } catch (error: any) {
    // Handle race on partial unique index
    if (error?.code === "23505") {
      return res.status(StatusCodes.CONFLICT).json({
        message: "Friend request already pending.",
      });
    }
    console.error("Error in sendFriendRequest:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

// ============================================================
// PATCH /api/friends/request/:requestId
// body: { action: "accept" | "reject" }
// ============================================================
export const handleFriendRequest = async (req: Request, res: Response) => {
  const requestId: any = req.params.requestId;
  const receiverId: any = req.playerId;
  const gameId: any = req.gameId;
  const { action } = req.body as { action: "accept" | "reject" };

  if (!["accept", "reject"].includes(action)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "action must be 'accept' or 'reject'.",
    });
  }

  // Map imperative API action -> past-tense DB enum value
  const newStatus: "accepted" | "rejected" =
    action === "accept" ? "accepted" : "rejected";

  try {
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.id, requestId),
            eq(friendRequests.gameId, gameId),
          ),
        )
        .for("update");

      if (!request) {
        return { error: "NOT_FOUND" as const };
      }
      if (request.receiverId !== receiverId) {
        return { error: "FORBIDDEN" as const };
      }
      if (request.status !== "pending") {
        return { error: "ALREADY_HANDLED" as const };
      }

      // Use mapped status
      await tx
        .update(friendRequests)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(friendRequests.id, requestId));

      if (action === "accept") {
        const [a, b] =
          request.senderId < request.receiverId
            ? [request.senderId, request.receiverId]
            : [request.receiverId, request.senderId];

        await tx.insert(friends).values({
          gameId,
          playerAId: a,
          playerBId: b,
        });
      }

      return { request };
    });

    if ("error" in result) {
      // `as const` on the map narrows values to `number`
      const statusMap = {
        NOT_FOUND: StatusCodes.NOT_FOUND,
        FORBIDDEN: StatusCodes.FORBIDDEN,
        ALREADY_HANDLED: StatusCodes.CONFLICT,
      } as const;

      const status = statusMap[result.error] ?? StatusCodes.INTERNAL_SERVER_ERROR;

      return res.status(status).json({
        message: result.error,
      });
    }

    const request = result.request;
    const io = getIO();

    if (action === "accept") {
      const [senderProfile] = await db
        .select({ id: players.id, displayName: players.displayName })
        .from(players)
        .where(eq(players.id, request.senderId))
        .limit(1);

      const [receiverProfile] = await db
        .select({ id: players.id, displayName: players.displayName })
        .from(players)
        .where(eq(players.id, request.receiverId))
        .limit(1);

      io.to(`player:${request.senderId}`).emit(
        SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED,
        { friend: receiverProfile },
      );
      io.to(`player:${request.receiverId}`).emit(SERVER_EVENTS.FRIEND_ADDED, {
        friend: senderProfile,
      });
    } else {
      io.to(`player:${request.senderId}`).emit(
        SERVER_EVENTS.FRIEND_REQUEST_REJECTED,
        { receiverId: request.receiverId },
      );
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      action,
    });
  } catch (error) {
    console.error("Error in handleFriendRequest:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

// ============================================================
// DELETE /api/friends/:playerId
// ============================================================
export const removeFriend = async (req: Request, res: Response) => {
  const currentPlayerId : any = req.playerId;
  const friendId : any = req.params.playerId;
  const gameId : any = req.gameId;

  try {
    const deleted = await db
      .delete(friends)
      .where(
        and(
          eq(friends.gameId, gameId),
          or(
            and(
              eq(friends.playerAId, currentPlayerId),
              eq(friends.playerBId, friendId),
            ),
            and(
              eq(friends.playerAId, friendId),
              eq(friends.playerBId, currentPlayerId),
            ),
          ),
        ),
      )
      .returning({ id: friends.id });

    // Only emit if we actually removed something
    if (deleted.length > 0) {
      getIO().to(`player:${friendId}`).emit(SERVER_EVENTS.FRIEND_REMOVED, {
        removedBy: currentPlayerId,
      });
    }

    // Idempotent — 204 even if they weren't friends
    return res.status(StatusCodes.NO_CONTENT).send();
  } catch (error) {
    console.error("Error in removeFriend:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

// ============================================================
// GET /api/friends
// ============================================================
export const listFriends = async (req: Request, res: Response) => {
  const playerId : any = req.playerId;
  const gameId : any = req.gameId;

  try {
    const result = await db.execute<{
      id: string;
      display_name: string;
      elo: number;
    }>(sql`
      SELECT p.id, p.display_name, p.elo
      FROM friends f
      INNER JOIN players p ON (
        (p.id = f.player_a_id AND f.player_b_id = ${playerId})
        OR (p.id = f.player_b_id AND f.player_a_id = ${playerId})
      )
      WHERE f.game_id = ${gameId}
      ORDER BY p.display_name ASC
    `);

    return res.status(StatusCodes.OK).json({ friends: result.rows });
  } catch (error) {
    console.error("Error in listFriends:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

// ============================================================
// GET /api/friends/requests?type=received|sent
// ============================================================
export const listFriendRequests = async (req: Request, res: Response) => {
  const playerId : any = req.playerId;
  const gameId : any = req.gameId;
  const type : any = (req.query.type as string) || "received";

  try {
    if (type === "sent") {
      const rows = await db.execute<{
        id: string;
        receiver_id: string;
        receiver_name: string;
        status: string;
        created_at: string;
      }>(sql`
        SELECT fr.id, fr.receiver_id, p.display_name AS receiver_name,
               fr.status, fr.created_at
        FROM friend_requests fr
        INNER JOIN players p ON p.id = fr.receiver_id
        WHERE fr.game_id = ${gameId}
          AND fr.sender_id = ${playerId}
          AND fr.status = 'pending'
        ORDER BY fr.created_at DESC
      `);
      return res.status(StatusCodes.OK).json({ requests: rows.rows });
    }

    // default: received
    const rows = await db.execute<{
      id: string;
      sender_id: string;
      sender_name: string;
      status: string;
      created_at: string;
    }>(sql`
      SELECT fr.id, fr.sender_id, p.display_name AS sender_name,
             fr.status, fr.created_at
      FROM friend_requests fr
      INNER JOIN players p ON p.id = fr.sender_id
      WHERE fr.game_id = ${gameId}
        AND fr.receiver_id = ${playerId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `);
    return res.status(StatusCodes.OK).json({ requests: rows.rows });
  } catch (error) {
    console.error("Error in listFriendRequests:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};