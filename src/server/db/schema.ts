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
export const NOTIFICATION_TYPES = [
  "entry_published",
  "entry_tagged",
  "trip_revealed",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];
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
  /** Create trips, then edit, hide or delete the ones this user created. */
  canManageTrips: integer("can_manage_trips", { mode: "boolean" }).notNull().default(false),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  /** Last time the account used the site (updated at most every few minutes). */
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
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
  /** Creator of the trip. Null once that account has been deleted: superuser only. */
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Calendar days, formatted YYYY-MM-DD. */
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(false),
  /** Photo shown for the trip: uploaded for it, or one of its entries' photos. Required to make it visible. */
  coverMediaId: integer("cover_media_id").references((): AnySQLiteColumn => media.id, { onDelete: "set null" }),
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
    /**
     * Order among the entries of the same day: higher means later in the day,
     * so shown higher in the journal (most recent first). A new entry, or one
     * moved to another day, takes the highest position of its day.
     */
    dayPosition: integer("day_position").notNull().default(0),
    /** Photo used as the entry's thumbnail; null means its first photo. */
    coverMediaId: integer("cover_media_id").references((): AnySQLiteColumn => media.id, { onDelete: "set null" }),
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

/** Keywords describing entries (plage, randonnée...), shared by all trips. */
export const tags = sqliteTable("tags", {
  id: id(),
  name: text("name").notNull(),
  /** Case- and accent-insensitive key: two tags cannot differ only by those. Used in filter URLs. */
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const entryTags = sqliteTable(
  "entry_tags",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] }), index("entry_tags_tag_idx").on(t.tagId)],
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
    /** Entry the file belongs to; null for a photo uploaded as a trip's thumbnail. */
    entryId: integer("entry_id").references(() => entries.id, { onDelete: "cascade" }),
    /** Trip whose thumbnail this photo is, when it was uploaded for the trip itself. */
    tripId: integer("trip_id").references((): AnySQLiteColumn => trips.id, { onDelete: "cascade" }),
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
    /**
     * Video conversion (only when FFMPEG_PATH is set): "pending" while the
     * original waits to be converted, "failed" when it could not be (the
     * original stays). Null when there is nothing to do.
     */
    processing: text("processing", { enum: ["pending", "failed"] }),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_entry_idx").on(t.entryId, t.position),
    index("media_trip_idx").on(t.tripId),
    // A file belongs either to an entry or, as its thumbnail, to a trip.
    check("media_single_owner", sql`(${t.entryId} is null) <> (${t.tripId} is null)`),
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
    /** Always set: the trip used for visibility checks (and the link target of `trip_revealed`). */
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** The entry concerned: set for every type except `trip_revealed`. */
    entryId: integer("entry_id").references(() => entries.id, { onDelete: "cascade" }),
    /** The recipient is identified in the entry (and is not its author). */
    isTagged: integer("is_tagged", { mode: "boolean" }).notNull().default(false),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientId, t.readAt, t.createdAt)],
);

/** Site-wide settings, one row per key (for instance the version of the site photo). */
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Who has opened which entry, and when for the first time. */
export const entryReads = sqliteTable(
  "entry_reads",
  {
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] }), index("entry_reads_user_idx").on(t.userId)],
);
