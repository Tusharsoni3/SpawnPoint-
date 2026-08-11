import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";

export interface AuthTokenPayload {
  id: string;
  email: string;
}

const JWT_SECRET : string = process.env.JWT_SECRET!;


// Extend Express's Request type so req.user is typed everywhere it's used
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!JWT_SECRET){
    return res.status(StatusCodes.BAD_REQUEST).json({message : 'Something went wrong in Middleware'})
}
    const token = req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const decoded = jwt.verify(token,JWT_SECRET ) as AuthTokenPayload;

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