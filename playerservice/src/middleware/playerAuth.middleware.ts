import { StatusCodes } from "http-status-codes";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { redis } from "../redis/config.js";

interface JwtPayload {
  playerId: string;
  gameId: string;
}

export const authPlayer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.gameId) {
    console.error("authPlayer: req.gameId is missing — check middleware order");
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      message: "Missing bearer token.",
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

  if (payload.gameId !== req.gameId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      message: "Token does not belong to this game.",
    });
  }

  try {
    const sessionKey = `session:${payload.playerId}:${payload.gameId}`;
    const storedToken = await redis.get(sessionKey);

    if (!storedToken || storedToken !== token) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Session expired or logged out. Please log in again.",
      });
    }
  } catch (error) {
    console.error("Error in authPlayer (session check):", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }

  req.playerId = payload.playerId;
  next();
};