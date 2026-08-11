import {
  boolean,
  integer,
  json,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { email, number } from "zod";
import { addCustomField } from "../controller/gameManagment.controller.js";
import { create } from "domain";
import { Table } from "drizzle-orm";

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
    name: text("name").unique().notNull(),
    email: text("email").notNull(),
    password: text("password").notNull(),
    elo: integer("elo"),
    customField: jsonb("customfields").default({}),
    lastActive: timestamp("lastActive").defaultNow(),
    createdAt: timestamp("createdAt").defaultNow(),
    gameId: uuid("gameId")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (table) => ({
    uniqueEmailPerGame: unique("unique_email_per_game").on(
      table.email,
      table.gameId,
    ),
  }),
);
