import jwt from "jsonwebtoken";
import type{ Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";

export interface PlayerAuthToken {
  id?: string;
  displayName? : string;
}

const PLAYER_JWT_SECRET : string = process.env.PLAYER_JWT_SECRET!;


export const PlayerAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!PLAYER_JWT_SECRET){
    return res.status(StatusCodes.BAD_REQUEST).json({message : 'Something went wrong in Middleware'})
}
    const token = req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const decoded = jwt.verify(token,PLAYER_JWT_SECRET ) as PlayerAuthToken;

    if (!decoded || !decoded.id) {
      return res.status(401).json({ message: "Unauthorized: Token is invalid" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};