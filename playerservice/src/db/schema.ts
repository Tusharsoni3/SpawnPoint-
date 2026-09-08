import {
  boolean,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  text,
  timestamp,
  unique,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const matchStatusEnum = pgEnum("match_status", [
  "waiting",
  "in_progress",
  "completed",
  "abandoned",
]);

export const matchResultEnum = pgEnum("match_result", [
  "normal",
  "disconnect_forfeit",
  "abandoned",
]);

export const friendRequestStatusEnum = pgEnum("friend_request_status", [
  "pending",
  "accepted",
  "rejected",
]);


export const developers = pgTable("developers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => developers.id, { onDelete: "cascade" }),
  name: text("name").unique().notNull(),
  genre: text("genre").notNull(),
  apiKey: text("api_key").notNull().unique(),
  customFields: jsonb("custom_fields").default({}),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: text("player_id").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(), // Store hashed passwords only
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    elo: integer("elo").notNull().default(1200),
    customData: jsonb("custom_data").default({}),
    lastActiveAt: timestamp("last_active_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniquePlayerPerGame: unique("unique_player_per_game").on(
      table.playerId,
      table.gameId,
    ),
  }),
);

export const friendRequests = pgTable(
  "friend_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: friendRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    // PREVENT duplicate pending requests between the same pair
    uniquePendingRequest: uniqueIndex("unique_pending_request")
      .on(table.gameId, table.senderId, table.receiverId)
      .where(sql`status = 'pending'`),
    // Indexes for fast lookups
    senderIdx: index("friend_req_sender_idx").on(table.gameId, table.senderId),
    receiverIdx: index("friend_req_receiver_idx").on(
      table.gameId,
      table.receiverId,
    ),
  }),
);


export const friends = pgTable(
  "friends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playerAId: uuid("player_a_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    playerBId: uuid("player_b_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // Enforce one friendship per unordered pair per game (FIXED SQL syntax)
    uniqueFriendship: uniqueIndex("unique_friendship").on(
      sql`game_id, LEAST(player_a_id, player_b_id), GREATEST(player_a_id, player_b_id)`,
    ),
    // Indexes for fast friend list queries (playerA OR playerB)
    playerAIdx: index("friends_player_a_idx").on(table.gameId, table.playerAId),
    playerBIdx: index("friends_player_b_idx").on(table.gameId, table.playerBId),
  }),
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    status: matchStatusEnum("status").notNull().default("waiting"),
    result: matchResultEnum("result"),
    winnerId: uuid("winner_id").references(() => players.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // Index for finding matches by status (e.g., waiting for matchmaking)
    statusIdx: index("matches_status_idx").on(table.status),
  }),
);

export const matchParticipants = pgTable(
  "match_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    // Optional: track which team (if team-based games)
    team: integer("team").default(0),
    // Optional: snapshot of their ELO at match start
    eloAtStart: integer("elo_at_start"),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => ({
    // A player can only be in a match once
    uniquePlayerPerMatch: unique("unique_player_per_match").on(
      table.matchId,
      table.playerId,
    ),
    // Index for "Find all matches for player X"
    playerMatchesIdx: index("match_participants_player_idx").on(
      table.playerId,
    ),
    matchPlayersIdx: index("match_participants_match_idx").on(table.matchId),
  }),
);