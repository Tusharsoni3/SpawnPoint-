import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { email, number } from "zod";
import { addCustomField } from "../controller/gameManagment.controller.js";
import { create } from "domain";
import { Table,sql } from "drizzle-orm";

export const developer = pgTable("developers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  developerId: uuid("developerId")
    .notNull()
    .references(() => developer.id, { onDelete: "cascade" }),
  name: text("name").unique().notNull(),
  genre: text("genre").notNull(),
  apiKey: text("apiKey").notNull().unique(),
  customFields: jsonb("customfields").default({}),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: text("player_id").notNull(), // developer's own ID
    displayName: text("display_name").notNull(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    elo: integer("elo").notNull().default(1200),
    customData: jsonb("custom_data").default({}),
    lastActiveAt: timestamp("last_active_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // Same player cannot exist twice in same game
    uniquePlayerPerGame: unique("unique_player_per_game").on(
      table.playerId,
      table.gameId,
    ),
  }),
);

export const matches = pgTable("matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  otherPlayersIds: text("otherplayer_ids").array().notNull() .default(sql`'{}'::text[]`),
  status: text("status").notNull().default("waiting"), // waiting/in_progress/completed/abandoned
  result: text("result"), // normal/disconnect_forfeit/abandoned
  winnerId: text("winner_id"), // null for draws or abandoned
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
