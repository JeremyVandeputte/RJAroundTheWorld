import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const USER_ROLES = ["superuser", "user"] as const;
export const ENTRY_STATUSES = ["draft", "published"] as const;
export const MEDIA_KINDS = ["photo", "video"] as const;
export const REACTION_TYPES = ["like", "love", "haha", "wow", "sad", "angry"] as const;
export const NOTIFICATION_TYPES = [
  "entry_published",
  "entry_comment",
  "entry_reaction",
  "comment_reply",
  "comment_reaction",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type ReactionType = (typeof REACTION_TYPES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: id(),
  /** Login identifier, stored lowercase. */
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("user"),
  canPublish: integer("can_publish", { mode: "boolean" }).notNull().default(false),
  canComment: integer("can_comment", { mode: "boolean" }).notNull().default(true),
  canReact: integer("can_react", { mode: "boolean" }).notNull().default(true),
  /** Create, edit and delete trips, and change their visibility. */
  canManageTrips: integer("can_manage_trips", { mode: "boolean" }).notNull().default(false),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    /** Hash of the session token: the raw token only lives in the cookie. */
    tokenHash: text("token_hash").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Failed login attempts, used for brute-force protection. */
export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: id(),
    username: text("username").notNull(),
    ip: text("ip").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("login_attempts_username_idx").on(t.username, t.createdAt),
    index("login_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);

export const trips = sqliteTable("trips", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Calendar days, formatted YYYY-MM-DD. */
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const entries = sqliteTable(
  "entries",
  {
    id: id(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Calendar day, formatted YYYY-MM-DD (no time, no timezone). */
    date: text("date").notNull(),
    title: text("title").notNull(),
    /** Simplified markdown: bold and links only. */
    body: text("body").notNull().default(""),
    status: text("status", { enum: ENTRY_STATUSES }).notNull().default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    // Point A: fixed place, or start of a one-way route.
    pointALat: real("point_a_lat"),
    pointALng: real("point_a_lng"),
    pointAName: text("point_a_name"),
    // Point B: end of a one-way route (optional).
    pointBLat: real("point_b_lat"),
    pointBLng: real("point_b_lng"),
    pointBName: text("point_b_name"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("entries_trip_date_idx").on(t.tripId, t.date),
    index("entries_author_idx").on(t.authorId),
    check(
      "entries_point_a_complete",
      sql`(${t.pointALat} is null) = (${t.pointALng} is null)`,
    ),
    check(
      "entries_point_b_complete",
      sql`(${t.pointBLat} is null) = (${t.pointBLng} is null)`,
    ),
    check(
      "entries_point_b_requires_a",
      sql`${t.pointBLat} is null or ${t.pointALat} is not null`,
    ),
  ],
);

/** Users identified ("tagged") in an entry. */
export const entryPeople = sqliteTable(
  "entry_people",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] }), index("entry_people_user_idx").on(t.userId)],
);

/** Files live on disk: the database only keeps paths and metadata. */
export const media = sqliteTable(
  "media",
  {
    id: id(),
    /** Random identifier used in URLs. */
    publicId: text("public_id").notNull().unique(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    uploaderId: integer("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    /** Paths relative to MEDIA_DIR. */
    filePath: text("file_path").notNull(),
    thumbPath: text("thumb_path"),
    mimeType: text("mime_type").notNull(),
    /** Total size on disk (file + thumbnail), counted against the quota. */
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull().default(0),
    // EXIF data kept for Phase 2 (placing an entry from photo GPS coordinates).
    exifLat: real("exif_lat"),
    exifLng: real("exif_lng"),
    exifTakenAt: text("exif_taken_at"),
    createdAt: createdAt(),
  },
  (t) => [index("media_entry_idx").on(t.entryId, t.position)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: id(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** Top-level comment this reply belongs to (single nesting level). */
    parentId: integer("parent_id").references((): AnySQLiteColumn => comments.id, {
      onDelete: "cascade",
    }),
    /** Null once the author's account has been deleted. */
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    /** Soft delete: keeps the thread intact when a comment has replies. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("comments_entry_idx").on(t.entryId, t.createdAt), index("comments_parent_idx").on(t.parentId)],
);

/** One reaction per user and per target (an entry or a comment). */
export const reactions = sqliteTable(
  "reactions",
  {
    id: id(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryId: integer("entry_id").references(() => entries.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    type: text("type", { enum: REACTION_TYPES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reactions_user_entry_unique").on(t.userId, t.entryId),
    uniqueIndex("reactions_user_comment_unique").on(t.userId, t.commentId),
    index("reactions_entry_idx").on(t.entryId),
    index("reactions_comment_idx").on(t.commentId),
    check(
      "reactions_single_target",
      sql`(${t.entryId} is null) <> (${t.commentId} is null)`,
    ),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    /** Always set: gives the link target and the trip used for visibility checks. */
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    /** For `entry_published`: the recipient is identified in the entry. */
    isTagged: integer("is_tagged", { mode: "boolean" }).notNull().default(false),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientId, t.readAt, t.createdAt)],
);
