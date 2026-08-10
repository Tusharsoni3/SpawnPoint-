import { developer } from "../db/schema.js";
import type { Request, Response, CookieOptions } from "express";
import type {
  SignUpCredentials,
  LoginCredentials,
  TypedRequest,
} from "../types/types.js";
import StatusCodes from "http-status-codes";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import { randomInt } from "crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

const generateTokenAndSetToken = (res: Response, userId: number) => {
  const token = jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: "7d",
  });
  const cookieOptions: CookieOptions = {
    httpOnly: true, // Prevents client-side JS from reading the cookie (XSS protection)
    sameSite: "strict", // Protects against Cross-Site Request Forgery (CSRF)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  };
  res.cookie("jwt", token, cookieOptions);
  return token;
};

export const handleDeveloperSignUp = async (
  req: TypedRequest<SignUpCredentials>,
  res: Response,
) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Username, email and password are required!",
    });
  }
  const [checkDeveloperEmailExist] = await db
    .select()
    .from(developer)
    .where(eq(developer.email, email))
    .limit(1);
  if (checkDeveloperEmailExist) {
    return res.status(StatusCodes.CONFLICT).json({
      message: "Email already exists",
    });
  }

  try {
    const hashedPassword = await argon2.hash("password");
    const [newUser] = await db.insert(developer).values({
      name,
      email,
      password: hashedPassword,
    });

    return res.status(StatusCodes.CREATED).json({
      message: "New user registered",
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const handleDeveloperLogin = async (
  req: TypedRequest<LoginCredentials>,
  res: Response,
) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Email and Password both are required",
    });
  }
  const [user] = await db
    .select()
    .from(developer)
    .where(eq(developer.email, email))
    .limit(1);
  if (!user) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: "Wrong Credentials" });
  }
  try {
    const checkPassword = await argon2.verify(user.password, password);
    if (!checkPassword) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Wrong Credentials",
      });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const logout = async (req : Request, res : Response) => {
  try {
    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: "strict",
    });
    return res
      .status(StatusCodes.NO_CONTENT)
      .json({message: "Logged out successfully" });
  } catch (error) {
    console.error("logout error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong while logging out" });
  }
};
