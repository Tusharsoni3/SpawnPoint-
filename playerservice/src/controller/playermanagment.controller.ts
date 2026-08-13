import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";
import { redis } from "../redis/config.js";
import { db } from "../db/index.js";
import { players } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import type{TypedRequest,playerRequest} from '../types/types.js';

interface AuthenticatedRequest extends playerRequest {
  gameId?: string;
}

export const loginPlayer = async (req: TypedRequest<playerRequest>, res: Response) => {
  const { playerId, displayName } = req.body;
  const gameId = req.gameId;

  if (!playerId || !displayName || !gameId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "playerId, displayName, and gameId are required",
    });
  }

  const lockKey = `login_lock:${playerId}:${gameId}`;
  const lock = await redis.set(lockKey, "1", "EX", 5, "NX");

  if (!lock) {
    return res.status(429).json({
      message: "Login already in progress. Try again.",
    });
  }
  try {
    // Find existing player
    const [existingPlayer] = await db
      .select()
      .from(players)
      .where(and(eq(players.playerId, playerId), eq(players.gameId, gameId)))
      .limit(1);

    let player: any = existingPlayer;

    if (!existingPlayer) {
      const [newPlayer] = await db
        .insert(players)
        .values({
          playerId,
          displayName,
          gameId,
        })
        .returning();

      player = newPlayer;

      // Publish player_created event
      await redis.publish(
        "player_created",
        JSON.stringify({
          playerId,
          gameId,
          displayName,
        }),
      );
    } else {
      // Update lastActiveAt
      await db
        .update(players)
        .set({ lastActiveAt: new Date() })
        .where(and(eq(players.playerId, playerId), eq(players.gameId, gameId)));
    }

    // Generate JWT
    const token = jwt.sign({ playerId, gameId }, process.env.JWT_SECRET!, {
      expiresIn: "24h",
    });

    await redis.set(`session:${playerId}:${gameId}`, token, "EX", 86400);

    return res.status(StatusCodes.OK).json({
      playerToken: token,
      playerId: player.playerId,
      displayName: player.displayName,
      elo: player.elo,
      customData: player.customData,
      createdAt: player.createdAt,
      lastActiveAt: player.lastActiveAt,
    });
  } catch (error) {
    console.error("Error in loginPlayer:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  } finally {
    await redis.del(lockKey);
  }
};
