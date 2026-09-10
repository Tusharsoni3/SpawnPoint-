import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { redis } from "../redis/config.js";
import { db } from "../db/index.js";
import { players, matches, matchParticipants } from "../db/schema.js";

const SALT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const LOCK_TTL_SECONDS = 5;

interface SignupBody { displayName: string; email: string; password: string; }
interface LoginBody  { email: string; password: string; }

interface JwtPayload {
  sub: string;     // player UUID
  gameId: string;
}

function sanitizePlayer(player: typeof players.$inferSelect) {
  const { password: _p, ...safe } = player;
  return safe;
}

function issueToken(playerUuid: string, gameId: string) {
  const payload: JwtPayload = { sub: playerUuid, gameId };
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "24h" });
}

function setSessionCookie(res: Response, token: string) {
  res.cookie("playerToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

// ---------------- SIGNUP ----------------//

export const signupPlayer = async (req: Request, res: Response) => {
  const { displayName, email, password } = req.body as SignupBody;
  const gameId = req.gameId;

  if (!displayName || !email || !password || !gameId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "displayName, email, password are required",
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
    const [existingPlayer] = await db
      .select()
      .from(players)
      .where(and(eq(players.email, email), eq(players.gameId, gameId)))
      .limit(1);

    if (existingPlayer) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "An account with this email already exists for this game.",
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [newPlayer] : any = await db
      .insert(players)
      .values({ displayName, email, password: passwordHash, gameId })
      .returning();

    const token = issueToken(newPlayer.id, gameId);
    await redis.set(
      `session:${newPlayer.id}:${gameId}`,
      token,
      "EX",
      SESSION_TTL_SECONDS,
    );

    setSessionCookie(res, token);

    await redis.publish(
      "player_created",
      JSON.stringify({ playerId: newPlayer.id, gameId, displayName }),
    );

    return res.status(StatusCodes.CREATED).json({
      playerToken: token,           // for non-browser clients
      player: sanitizePlayer(newPlayer),
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

// ---------------- LOGIN ----------------//
export const loginPlayer = async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginBody;
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

    if (!existingPlayer) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Invalid email or password.",
      });
    }

    const ok = await bcrypt.compare(password, existingPlayer.password);
    if (!ok) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Invalid email or password.",
      });
    }

    const [updatedPlayer] : any = await db
      .update(players)
      .set({ lastActiveAt: new Date() })
      .where(eq(players.id, existingPlayer.id))
      .returning();

    const token = issueToken(updatedPlayer.id, gameId);
    await redis.set(
      `session:${updatedPlayer.id}:${gameId}`,
      token,
      "EX",
      SESSION_TTL_SECONDS,
    );

    setSessionCookie(res, token);

    return res.status(StatusCodes.OK).json({
      playerToken: token,
      player: sanitizePlayer(updatedPlayer),
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

// ---------------- LOGOUT ----------------
export const logoutPlayer = async (req: Request, res: Response) => {
  const token =
    req.cookies?.playerToken ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!token) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "No token provided.",
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
    const sessionKey = `session:${payload.sub}:${payload.gameId}`;
    const storedToken = await redis.get(sessionKey);
    if (storedToken === token) {
      await redis.del(sessionKey);
    }

    res.clearCookie("playerToken", { path: "/" });

    return res.status(StatusCodes.OK).json({ message: "Logged out." });
  } catch (error) {
    console.error("Error in logoutPlayer:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

// ----------------- Get player Information ---------
export const getPlayerInfo = async (req: Request, res: Response) => {
  try {
    const playerTextId: any = req.playerId;
    const gameId: any = req.gameId;

    const [player] = await db
      .select()
      .from(players)
      .where(
        and(eq(players.id, playerTextId), eq(players.gameId, gameId)),
      )
      .limit(1);

    if (!player) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Player not found",
      });
    }

    const [totalMatchesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(matchParticipants)
      .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
      .where(
        and(
          eq(matchParticipants.playerId, player.id),
          eq(matches.gameId, gameId),
          eq(matches.status, "completed"),
        ),
      );

    const [totalWinsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(
        and(
          eq(matches.gameId, gameId),
          eq(matches.status, "completed"),
          eq(matches.winnerId, player.id),
        ),
      );

    const totalMatches = Number(totalMatchesResult?.count) || 0;
    const totalWins = Number(totalWinsResult?.count) || 0;
    const totalLosses = totalMatches - totalWins;

    const recentMatchesResult = await db.execute<{
      id: string;
      status: string;
      result: string | null;
      winner_id: string | null;
      started_at: Date | null;
      ended_at: Date | null;
      created_at: Date | null;
      participants: Array<{
        id: string;
        displayName: string;
        team: number | null;
        eloChange: number | null;
      }>;
    }>(
      sql`
        SELECT 
          m.id,
          m.status,
          m.result,
          m.winner_id,
          m.started_at,
          m.ended_at,
          m.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', p.id,
                'displayName', p.display_name,
                'team', mp.team,
                'eloChange', mp.elo_change  
              )
            ) FILTER (WHERE mp.player_id IS NOT NULL),
            '[]'
          ) as participants
        FROM matches m
        INNER JOIN match_participants mp ON m.id = mp.match_id
        INNER JOIN players p ON mp.player_id = p.id
        WHERE m.game_id = ${gameId}
          AND m.status = 'completed'
          AND mp.player_id = ${player.id}
        GROUP BY m.id
        ORDER BY m.created_at DESC
        LIMIT 20
      `,
    );

    const recentMatches = recentMatchesResult.rows;

    const formattedMatches = recentMatches.map((match) => {
      // Find this player's entry in the participants array
      const myParticipant = match.participants.find(
        (p) => p.id === player.id,
      );

      return {
        ...match,
        didPlayerWin: match.winner_id === player.id,
        eloChange: myParticipant?.eloChange ?? 0,
      };
    });

    return res.status(StatusCodes.OK).json({
      player: {
        id: player.id,
        displayName: player.displayName,
        elo: player.elo,
        customData: player.customData,
        createdAt: player.createdAt,
        lastActiveAt: player.lastActiveAt,
      },
      stats: {
        totalMatches,
        totalWins,
        totalLosses,
        winRate: totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0,
      },
      recentMatches: formattedMatches,
    });
  } catch (error) {
    console.error("Error in getPlayerInfo:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};
