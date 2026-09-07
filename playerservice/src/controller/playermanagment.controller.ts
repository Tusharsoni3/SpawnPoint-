import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq, and, desc } from "drizzle-orm";
import { redis } from "../redis/config.js";
import { db } from "../db/index.js";
import { players, matches } from "../db/schema.js";
import type { TypedRequest } from "../types/types.js";

const SALT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const LOCK_TTL_SECONDS = 5;

interface GameScopedRequest {
  gameId: string;
}

interface SignupBody {
  playerId: string;
  displayName: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

type SignupRequest = TypedRequest<SignupBody> & GameScopedRequest;
type LoginRequest = TypedRequest<LoginBody> & GameScopedRequest;

interface JwtPayload {
  playerId: string;
  gameId: string;
}

/** Strip the password hash before ever sending a player back to a client. */
function sanitizePlayer(player: typeof players.$inferSelect) {
  const { password: _password, ...safe } = player;
  return safe;
}

function issueToken(playerId: string, gameId: string) {
  const payload: JwtPayload = { playerId, gameId };
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "24h" });
}

/ ---------------- SIGNUP ---------------- /
export const signupPlayer = async (req: SignupRequest, res: Response) => {
  const { playerId, displayName, email, password } = req.body;
  const gameId = req.gameId;

  if (!playerId || !displayName || !email || !password || !gameId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message:
        "playerId, displayName, email, password, and gameId are required",
    });
  }

  const lockKey = `signup_lock:${gameId}:${email}`;
  const lock = await redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");

  if (!lock) {
    return res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      message: "Signup already in progress. Try again.",
    });
  }

  try {
    const [existingByEmail] = await db
      .select()
      .from(players)
      .where(eq(players.email, email))
      .limit(1);

    if (existingByEmail) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "An account with this email already exists.",
      });
    }

    const [existingInGame] = await db
      .select()
      .from(players)
      .where(and(eq(players.playerId, playerId), eq(players.gameId, gameId)))
      .limit(1);

    if (existingInGame) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "This playerId already exists for this game.",
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [newPlayer]: any = await db
      .insert(players)
      .values({
        playerId,
        displayName,
        email,
        password: passwordHash,
        gameId,
      })
      .returning();

    await redis.publish(
      "player_created",
      JSON.stringify({ playerId, gameId, displayName }),
    );

    const token = issueToken(newPlayer.playerId, gameId);
    await redis.set(
      `session:${newPlayer.playerId}:${gameId}`,
      token,
      "EX",
      SESSION_TTL_SECONDS,
    );

    return res.status(StatusCodes.CREATED).json({
      playerToken: token,
      ...sanitizePlayer(newPlayer),
    });
  } catch (error) {
    console.error("Error in signupPlayer:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  } finally {
    await redis.del(lockKey);
  }
};

/ ---------------- LOGIN ---------------- /
export const loginPlayer = async (req: LoginRequest, res: Response) => {
  const { email, password } = req.body;
  const gameId = req.gameId;

  if (!email || !password || !gameId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "email, password, and gameId are required",
    });
  }

  const lockKey = `login_lock:${gameId}:${email}`;
  const lock = await redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");

  if (!lock) {
    return res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      message: "Login already in progress. Try again.",
    });
  }

  try {
    const [existingPlayer] = await db
      .select()
      .from(players)
      .where(and(eq(players.email, email), eq(players.gameId, gameId)))
      .limit(1);

    // Same message for "no such player" and "wrong password" on purpose —
    // don't leak which one it was.
    if (!existingPlayer) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      existingPlayer.password,
    );

    if (!passwordMatches) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Invalid email or password.",
      });
    }

    const [updatedPlayer]: any = await db
      .update(players)
      .set({ lastActiveAt: new Date() })
      .where(
        and(
          eq(players.playerId, existingPlayer.playerId),
          eq(players.gameId, gameId),
        ),
      )
      .returning();

    const token = issueToken(updatedPlayer.playerId, gameId);
    await redis.set(
      `session:${updatedPlayer.playerId}:${gameId}`,
      token,
      "EX",
      SESSION_TTL_SECONDS,
    );

    return res.status(StatusCodes.OK).json({
      playerToken: token,
      ...sanitizePlayer(updatedPlayer),
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

/ ---------------- LOGOUT ---------------- /
export const logoutPlayer = async (
  req: TypedRequest<unknown>,
  res: Response,
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Authorization bearer token is required to log out.",
    });
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  } catch {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      message: "Invalid or expired token.",
    });
  }

  try {
    const sessionKey = `session:${payload.playerId}:${payload.gameId}`;
    const storedToken = await redis.get(sessionKey);

    // Only clear the session if it matches the presented token, so a stale
    // token can't be used to kill a newer, still-valid session.
    if (storedToken === token) {
      await redis.del(sessionKey);
    }

    return res.status(StatusCodes.OK).json({ message: "Logged out." });
  } catch (error) {
    console.error("Error in logoutPlayer:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};
/----------------- Get player Information ---------/
export const getPlayerInfo = async (req: Request, res: Response) => {
  try {
    const playerId: any = req.playerId;
    const gameId: any = req.gameId;

    const [player] = await db
      .select()
      .from(players)
      .where(and(eq(players.playerId, playerId), eq(players.gameId, gameId)))
      .limit(1);

    if (!player) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Player not found",
      });
    }
    const matcheInfo = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.playerId, playerId),
          eq(matches.gameId, gameId),
          eq(matches.status, "completed"),
        ),
      )
      .orderBy(desc(matches.createdAt));

    const totalMatches = matcheInfo.length;
    const totalWins = matcheInfo.filter(m => m.winnerId === playerId).length;
    const totalLosses = totalMatches - totalWins;


    return res.status(StatusCodes.OK).json({
      player: {
        playerId: player.playerId,
        displayName: player.displayName,
        elo: player.elo,
        customData: player.customData,
        createdAt: player.createdAt,
        lastActiveAt: player.lastActiveAt,
      },
      Stats : {
        totalMatches,
        totalWins,
        totalLosses,
      },
      // matches : {
        // this section will be written accroding to the needes 
      // }
    });
  } catch (error) {
    console.error("Error in getPlayerInfo:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

