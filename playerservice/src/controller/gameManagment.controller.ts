import {  games ,players} from "../db/schema.js";
import type { Request, Response } from "express";
import type {
  CustomeGameFields,
  GameField,
  TypedRequest,
} from "../types/types.js";
import { db } from "../db/index.js";
import { eq, and, name } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import crypto from "crypto";
import { PgUUID } from "drizzle-orm/pg-core";
import { string } from "zod";

const generateApiKey = (): string => {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  return `gp_${randomBytes}`;
};

export const registerGame = async (
  req: TypedRequest<GameField>,
  res: Response,
) => {
  try {
    const { name, genre } = req.body;
    const developerId = req.user?.id;

    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }

    if (!name || !genre) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "name and genre are required",
      });
    }

    const apiKey: string = generateApiKey();

    const [checkGameExists] = await db
      .select()
      .from(games)
      .where(and(eq(games.developerId, developerId), eq(games.name, name)))
      .limit(1);

    if (checkGameExists) {
      return res.status(StatusCodes.CONFLICT).json({
        message: "Game already exists",
      });
    }

    await db.insert(games).values({
      developerId,
      name,
      genre,
      apiKey,
    });

    return res.status(StatusCodes.CREATED).json({
      message: "Game registered successfully",
    });
  } catch (error) {
    console.error("Register Game Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

export const addCustomField = async (
  req: TypedRequest<CustomeGameFields>,
  res: Response,
) => {
  try {
    const { gameId }: any = req.params;
    const { customFields } = req.body;
    const developerId = req.user?.id;

    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }

    if (
      !customFields ||
      typeof customFields !== "object" ||
      Array.isArray(customFields)
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "customFields must be a valid object",
      });
    }
    const [existingGame] = await db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)))
      .limit(1);

    if (!existingGame) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Game not found",
      });
    }

    const mergedCustomFields = {
      ...((existingGame.customFields as Record<string, unknown>) ?? {}),
      ...customFields,
    };

    const [updatedGame] = await db
      .update(games)
      .set({ customFields: mergedCustomFields })
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)))
      .returning();

    return res.status(StatusCodes.OK).json({
      message: "Custom fields updated successfully",
      data: updatedGame,
    });
  } catch (error) {
    console.error("Custome field updation Game Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

export const getAllGames = async (req: Request, res: Response) => {
  try {
    const developerId = req.user?.id;
    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }

    const devGames = await db
      .select()
      .from(games)
      .where(eq(games.developerId, developerId));

    return res.status(StatusCodes.OK).json({
      message: "Games fetched successfully",
      data: devGames,
    });
  } catch (error) {
    console.error("Fetching Game Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

export const getGame = async (req: Request, res: Response) => {
  try {
    const { gameId }: any = req.params;
    const developerId = req.user?.id;
    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }
    const [fetchGameDetails] = await db
      .select({
        id: games.id,
        name: games.name,
        genre: games.genre,
        isActive: games.isActive,
        customFields: games.customFields,
        createdAt: games.createdAt,
      })
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)));

    if (!fetchGameDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Game not found",
      });
    }
    return res.status(StatusCodes.OK).json({
      message: "Game fetched successfully",
      data: fetchGameDetails,
    });
  } catch (error) {
    console.error("Error in fetching game:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

export const updateGame = async (
  req: TypedRequest<GameField>,
  res: Response,
) => {
  try {
    const { name, genre } = req.body;

    if (!name && !genre) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "At least one of name or genre must be provided",
      });
    }

    const developerId = req.user?.id;
    const { gameId }: any = req.params;

    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }

    const updateData: Partial<{ name: string; genre: string }> = {};
    if (name) updateData.name = name;
    if (genre) updateData.genre = genre;

    const [updatedGameDetails] = await db
      .update(games)
      .set(updateData)
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)))
      .returning();

    if (!updatedGameDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Game not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      message: "Game updated successfully",
      data: updatedGameDetails,
    });
  } catch (error) {
    console.error("Error in updating game:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

export const changeActiveStatus = async (req: Request, res: Response) => {
  try {
    const developerId = req.user?.id;
    const { gameId }: any = req.params;

    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }

    const [existingGame] = await db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)));

    if (!existingGame) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Game not found",
      });
    }

    const [updateGameStatus] = await db
      .update(games)
      .set({ isActive: !existingGame.isActive })
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)))
      .returning();

    return res.status(StatusCodes.OK).json({
      message: "Game updated successfully",
      data: updateGameStatus,
    });
  } catch (error) {
    console.error("Error in updating game:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};

export const getPlayers = async (req: Request, res: Response) => {
  try {
    const { gameId }  : any = req.params;
    const developerId : any = req.user?.id;

    if (!developerId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Unauthorized: developer not found on request",
      });
    }

    // verify this game actually belongs to the requesting developer
    const [gameOwned] = await db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.developerId, developerId)))
      .limit(1);

    if (!gameOwned) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Game not found",
      });
    }

    const gamePlayers = await db
      .select({
        id: players.id,
        name: players.name,
        elo: players.elo,
      })
      .from(players)
      .where(eq(players.gameId, gameId));

    return res.status(StatusCodes.OK).json({
      message: "Players fetched successfully",
      data: gamePlayers,
    });
  } catch (error) {
    console.error("Error in fetching players:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
    });
  }
};
//completed