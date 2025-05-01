import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define checkin types
export const CheckinType = {
  MANUAL: 'manual',
  AUTOUP: 'autoup',
  WIN_PROMOTED: 'win_promoted',
  LOSS_PROMOTED: 'loss_promoted',
  BUMP: 'bump',
  CHECKOUT: 'checkout',
  HORIZONTAL_SWAP: 'horizontal_swap',
  VERTICAL_SWAP: 'vertical_swap'
} as const;

export type CheckinType = typeof CheckinType[keyof typeof CheckinType];

// Define all tables first
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  birthYear: integer("birth_year").notNull(),
  birthMonth: integer("birth_month"),
  birthDay: integer("birth_day"),
  isPlayer: boolean("is_player").notNull().default(true),
  isBank: boolean("is_bank").notNull().default(false),
  isBook: boolean("is_book").notNull().default(false),
  isEngineer: boolean("is_engineer").notNull().default(false),
  isRoot: boolean("is_root").notNull().default(false),
  isGym: boolean("is_gym").notNull().default(false),
  autoup: boolean("autoup").notNull().default(true),
});

export const gameSets = pgTable("game_sets", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by").notNull(),
  playersPerTeam: integer("players_per_team").notNull().default(4),
  gym: text("gym").notNull().default('fonde'),
  maxConsecutiveGames: integer("max_consecutive_games").notNull().default(2),
  timeLimit: integer("time_limit").notNull().default(15),
  winScore: integer("win_score").notNull().default(21),
  pointSystem: text("point_system").notNull().default('2s and 3s'),
  isActive: boolean("is_active").notNull().default(true),
  numberOfCourts: integer("number_of_courts").notNull().default(2),
  currentQueuePosition: integer("current_queue_position").notNull().default(1),
  queueNextUp: integer("queue_next_up").notNull().default(1),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  setId: integer("set_id").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  team1Score: integer("team1_score"),
  team2Score: integer("team2_score"),
  clubIndex: integer("club_index").notNull().default(34),
  court: text("court").notNull(),
  state: text("state").notNull().default('started'),
});

export const checkins = pgTable("checkins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  gameSetId: integer("game_set_id").notNull(),
  queuePosition: integer("queue_position").notNull(),
  checkInTime: timestamp("check_in_time").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  clubIndex: integer("club_index").notNull().default(34),
  checkInDate: text("check_in_date").notNull(),
  gameId: integer("game_id"),
  type: text("type").notNull().default('manual'),
  team: integer("team"),  // New column: team number (1 or 2, or null if not assigned)
});

export const gamePlayers = pgTable("game_players", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  userId: integer("user_id").notNull(),
  team: integer("team").notNull(),
});

// Chat message table for Scoot(1995)
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  clubIndex: integer("club_index").notNull().default(1995), // Scoot(1995)
  hasMedia: boolean("has_media").default(false).notNull(),
  mediaId: integer("media_id"),  // Will reference media_attachments.id
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedBy: integer("deleted_by").references(() => users.id),
  deletedAt: timestamp("deleted_at"),
});

// Media attachments for chat messages
export const mediaAttachments = pgTable("media_attachments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  messageId: integer("message_id").notNull(),  // References messages.id
  mediaType: text("media_type").notNull(), // "image", "video", etc.
  mediaPath: text("media_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Moderation logs for tracking moderation actions
export const moderationLogs = pgTable("moderation_logs", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id),
  userId: integer("user_id").notNull().references(() => users.id), // User who took action
  action: text("action").notNull(), // e.g. "delete", "restore"
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  notes: text("notes"), // Optional notes from moderator
});

// Message bumps for tracking who bumped which messages
export const messageBumps = pgTable("message_bumps", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id),
  userId: integer("user_id").notNull().references(() => users.id), // User who bumped the message
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Define schemas after all tables are defined
const userBaseSchema = createInsertSchema(users);

export const insertUserSchema = userBaseSchema.extend({
  username: z.string()
    .min(1, "Username is required")
    .transform(val => val.toLowerCase()),
  password: z.string().min(1, "Password is required"),
  email: z.string().nullish().optional(),
  phone: z.string().nullish().optional(),
  firstName: z.string().nullish().optional(),
  lastName: z.string().nullish().optional(),
  birthYear: z.number().min(1900).max(new Date().getFullYear()),
  birthMonth: z.number().min(1).max(12).nullish().optional(),
  birthDay: z.number().min(1).max(31).nullish().optional(),
  isPlayer: z.boolean().default(true),
  isBank: z.boolean().default(false),
  isBook: z.boolean().default(false),
  isEngineer: z.boolean().default(false),
  isRoot: z.boolean().default(false),
  isGym: z.boolean().default(false),
});

export const insertGameSetSchema = createInsertSchema(gameSets, {
  playersPerTeam: z.number().min(1).max(5),
  gym: z.enum(['fonde']),
  maxConsecutiveGames: z.number().min(1),
  timeLimit: z.number().min(5).max(60),
  winScore: z.number().min(1),
  pointSystem: z.enum(['1s only', '2s only', '2s and 3s']),
  numberOfCourts: z.number().min(1).max(10),
}).omit({
  id: true,
  createdAt: true,
  isActive: true,
  createdBy: true,
  currentQueuePosition: true,
  queueNextUp: true
});

export const insertGameSchema = createInsertSchema(games, {
  setId: z.number(),
  startTime: z.string(),
  court: z.string(),
  state: z.enum(['started', 'final']).default('started'),
}).omit({
  id: true,
  endTime: true,
  team1Score: true,
  team2Score: true,
  clubIndex: true,
});

export const insertCheckinSchema = createInsertSchema(checkins);
export const insertGamePlayerSchema = createInsertSchema(gamePlayers);

// Chat-related schemas
export const insertMessageSchema = createInsertSchema(messages, {
  content: z.string().nullish(),
  hasMedia: z.boolean().default(false),
}).omit({
  id: true,
  createdAt: true,
  isDeleted: true,
  deletedBy: true,
  deletedAt: true,
});

export const insertMediaAttachmentSchema = createInsertSchema(mediaAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({
  id: true,
  timestamp: true,
});

// Message bump schema
export const insertMessageBumpSchema = createInsertSchema(messageBumps).omit({
  id: true,
  timestamp: true,
});

// Export types after schemas are defined
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type GamePlayer = typeof gamePlayers.$inferSelect;
export type GameSet = typeof gameSets.$inferSelect;
export type InsertGameSet = z.infer<typeof insertGameSetSchema>;
export type InsertGame = z.infer<typeof insertGameSchema>;

// Chat-related types
export type Message = typeof messages.$inferSelect;
export type MediaAttachment = typeof mediaAttachments.$inferSelect;
export type ModerationLog = typeof moderationLogs.$inferSelect;
export type MessageBump = typeof messageBumps.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertMediaAttachment = z.infer<typeof insertMediaAttachmentSchema>;
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type InsertMessageBump = z.infer<typeof insertMessageBumpSchema>;