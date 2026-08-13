import type { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { eq } from "drizzle-orm"; 
import { games } from "../db/schema.js";
import { redis } from "../redis/config.js";
import { db } from "../db/index.js";

declare global {
  namespace Express {
    interface Request {
      gameId?: string;
      developerId?: string;
    }
  }
}


const checkValidApiKey = async (apiKey: string) => {
  if (!apiKey) return null;

  // Check Redis cache first
  const cached = await redis.get(`apikey:${apiKey}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fallback to database
  const [validKey] = await db
    .select()
    .from(games)
    .where(eq(games.apiKey, apiKey))
    .limit(1);

  if (!validKey) {
    return null;
  }

  // Cache result for 1 hour (3600 seconds)
  await redis.set(`apikey:${apiKey}`, JSON.stringify(validKey), "EX", 86400);

  return validKey;
};


export const apiKeyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    const apiKey = (req.get("x-api-key") || req.get("api-key")) as string | undefined;

    if (!apiKey) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "You are not authorized" });
    }

    const gameData = await checkValidApiKey(apiKey);

    if (!gameData) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: "Invalid API key" });
    }

    req.gameId = gameData.id;
    req.developerId = gameData.developerId;

    return next();
  } catch (error) {
    console.error("Internal server error at apiKeyMiddleware:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Internal Server Error" });
  }
};