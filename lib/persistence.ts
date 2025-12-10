import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  generateSessionToken,
  generateUserId,
  hashPassword,
  SESSION_DURATION_MS,
} from "./auth";

export type StoredMessage = {
  id: string;
  role: string;
  content: unknown;
  pending?: boolean;
  error?: string;
  createdAt?: number;
  edited?: boolean;
  cost?: number;
  reasoning?: string;
  reasoningDetails?: unknown;
};

export type StoredChat = {
  id: string;
  title?: string;
  createdAt?: number;
  messages: StoredMessage[];
  userId?: string;
};

export type StoredConfig = Record<string, unknown>;

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
};

type SqliteInstance = {
  pragma?: (sql: string) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => any;
  transaction?: (fn: () => void) => () => void;
};

let db: SqliteInstance | null = null;
const require = createRequire(import.meta.url);

function createDatabase(dbPath: string): SqliteInstance {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Better = require("better-sqlite3");
    return new Better(dbPath);
  } catch (err) {
    if (typeof (globalThis as any).Bun !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const BunSqlite = require("bun:sqlite");
      return new BunSqlite.Database(dbPath, { create: true, strict: true });
    }
    throw err;
  }
}

function getDb() {
  if (db) return db;
  try {
    const dataDir = path.join(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "app.db");
    db = createDatabase(dbPath);
    if (db.pragma) {
      try {
        db.pragma("journal_mode = WAL");
      } catch { }
    } else {
      db.exec("PRAGMA journal_mode = WAL;");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER,
        expires_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER,
        user_id TEXT REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        role TEXT,
        content TEXT,
        pending INTEGER,
        error TEXT,
        created_at INTEGER,
        edited INTEGER,
        cost REAL,
        reasoning TEXT,
        reasoning_details TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        key TEXT NOT NULL,
        value TEXT,
        UNIQUE(user_id, key)
      );
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        prompt TEXT,
        model TEXT,
        size TEXT,
        steps INTEGER,
        guidance_scale REAL,
        seed INTEGER,
        cost REAL,
        created_at INTEGER,
        source_image_url TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    // Migration: add columns if missing (for existing databases)
    try {
      db.exec("ALTER TABLE messages ADD COLUMN cost REAL");
    } catch {
      // already added
    }
    try {
      db.exec("ALTER TABLE messages ADD COLUMN reasoning TEXT");
    } catch {
      // already added
    }
    try {
      db.exec("ALTER TABLE messages ADD COLUMN reasoning_details TEXT");
    } catch {
      // already added
    }
    try {
      db.exec("ALTER TABLE chats ADD COLUMN user_id TEXT REFERENCES users(id)");
    } catch {
      // already added
    }

    // Bootstrap admin user if no users exist
    bootstrapAdminUser(db);

    return db;
  } catch (error) {
    console.error("[persistence] failed to init db:", error);
    throw error;
  }
}

function bootstrapAdminUser(database: SqliteInstance) {
  const userCount = database
    .prepare("SELECT COUNT(*) as count FROM users")
    .get() as { count: number };

  if (userCount.count === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || "admin";
    const adminId = generateUserId();
    const passwordHash = hashPassword(adminPassword);

    database
      .prepare(
        `INSERT INTO users (id, username, password_hash, is_admin, created_at) 
         VALUES (:id, :username, :passwordHash, 1, :createdAt)`,
      )
      .run({
        id: adminId,
        username: "admin",
        passwordHash,
        createdAt: Date.now(),
      });

    // Migrate any existing chats to admin user
    database
      .prepare("UPDATE chats SET user_id = :userId WHERE user_id IS NULL")
      .run({ userId: adminId });

    console.log("[persistence] Created default admin user");
  }
}

function runTransaction(database: SqliteInstance, fn: () => void) {
  if (typeof database.transaction === "function") {
    return database.transaction(fn)();
  }
  // Fallback: just execute (no transactional guarantees)
  return fn();
}

// ============ USER MANAGEMENT ============

export function createUser(
  username: string,
  passwordHash: string,
  isAdmin = false,
): StoredUser {
  const database = getDb();
  const id = generateUserId();
  const createdAt = Date.now();

  database
    .prepare(
      `INSERT INTO users (id, username, password_hash, is_admin, created_at) 
       VALUES (:id, :username, :passwordHash, :isAdmin, :createdAt)`,
    )
    .run({
      id,
      username,
      passwordHash,
      isAdmin: isAdmin ? 1 : 0,
      createdAt,
    });

  return { id, username, passwordHash, isAdmin, createdAt };
}

export function getUserByUsername(username: string): StoredUser | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM users WHERE username = :username LIMIT 1")
    .get({ username }) as any;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
  };
}

export function getUserById(id: string): StoredUser | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM users WHERE id = :id LIMIT 1")
    .get({ id }) as any;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
  };
}

export function listUsers(): Omit<StoredUser, "passwordHash">[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC")
    .all() as any[];

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
  }));
}

export function updateUserPassword(id: string, passwordHash: string): boolean {
  const database = getDb();
  const result = database
    .prepare("UPDATE users SET password_hash = :passwordHash WHERE id = :id")
    .run({ id, passwordHash });
  return (result as any).changes > 0;
}

export function deleteUser(id: string): boolean {
  const database = getDb();
  // Cascade delete sessions, chats, messages, and config
  const tx = () => {
    database.prepare("DELETE FROM sessions WHERE user_id = :id").run({ id });
    database.prepare("DELETE FROM config WHERE user_id = :id").run({ id });
    // Messages will cascade delete with chats due to FK
    database.prepare("DELETE FROM chats WHERE user_id = :id").run({ id });
    database.prepare("DELETE FROM users WHERE id = :id").run({ id });
  };
  runTransaction(database, tx);
  return true;
}

// ============ SESSION MANAGEMENT ============

export function createSession(userId: string): string {
  const database = getDb();
  const token = generateSessionToken();
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_DURATION_MS;

  database
    .prepare(
      `INSERT INTO sessions (token, user_id, created_at, expires_at) 
       VALUES (:token, :userId, :createdAt, :expiresAt)`,
    )
    .run({ token, userId, createdAt, expiresAt });

  return token;
}

export function getSession(token: string): StoredUser | null {
  const database = getDb();
  const session = database
    .prepare(
      `SELECT s.*, u.* FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.token = :token AND s.expires_at > :now LIMIT 1`,
    )
    .get({ token, now: Date.now() }) as any;

  if (!session) return null;

  return {
    id: session.user_id,
    username: session.username,
    passwordHash: session.password_hash,
    isAdmin: !!session.is_admin,
    createdAt: session.created_at,
  };
}

export function deleteSession(token: string): void {
  const database = getDb();
  database.prepare("DELETE FROM sessions WHERE token = :token").run({ token });
}

export function cleanExpiredSessions(): number {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM sessions WHERE expires_at < :now")
    .run({ now: Date.now() });
  return (result as any).changes || 0;
}

// ============ CHAT MANAGEMENT (USER-SCOPED) ============

export function listChats(
  userId?: string,
): Array<{
  id: string;
  title: string;
  createdAt: number;
  messageCount: number;
}> {
  const database = getDb();
  let sql = `
    SELECT c.id, COALESCE(c.title, '') AS title, COALESCE(c.created_at, 0) AS createdAt,
      COUNT(m.id) AS messageCount
    FROM chats c
    LEFT JOIN messages m ON m.chat_id = c.id
  `;

  if (userId) {
    sql += " WHERE c.user_id = :userId";
  }

  sql += " GROUP BY c.id ORDER BY c.created_at DESC";

  const stmt = database.prepare(sql);
  return (userId ? stmt.all({ userId }) : stmt.all()) as any;
}

export function getChat(id: string, userId?: string): StoredChat | null {
  const database = getDb();

  let sql =
    "SELECT id, title, created_at as createdAt, user_id FROM chats WHERE id = :id";
  if (userId) {
    sql += " AND user_id = :userId";
  }
  sql += " LIMIT 1";

  const chatRow = database.prepare(sql).get(userId ? { id, userId } : { id }) as any;
  if (!chatRow) return null;

  const messages = database
    .prepare(
      `SELECT id, role, content, pending, error, created_at as createdAt, edited, cost, reasoning, reasoning_details
       FROM messages WHERE chat_id = :id ORDER BY created_at ASC`,
    )
    .all({ id })
    .map((row: any) => ({
      id: row.id,
      role: row.role,
      content: safeJsonParse(row.content),
      pending: !!row.pending,
      error: row.error || undefined,
      createdAt: row.createdAt || undefined,
      edited: !!row.edited,
      cost: typeof row.cost === "number" ? row.cost : undefined,
      reasoning: row.reasoning || undefined,
      reasoningDetails: row.reasoning_details
        ? safeJsonParse(row.reasoning_details)
        : undefined,
    })) as StoredMessage[];

  return {
    id: chatRow.id,
    title: chatRow.title || undefined,
    createdAt: chatRow.createdAt || undefined,
    messages,
    userId: chatRow.user_id,
  };
}

export function saveChat(chat: StoredChat, userId?: string) {
  const database = getDb();
  const createdAt =
    chat.createdAt ??
    chat.messages?.find((m) => m.createdAt)?.createdAt ??
    Date.now();
  const title =
    chat.title ||
    deriveTitleFromMessages(chat.messages) ||
    `Chat ${chat.id.slice(-4)}`;

  const effectiveUserId = userId || chat.userId;

  const insertChat = database.prepare(
    `INSERT INTO chats (id, title, created_at, user_id) 
     VALUES (:id, :title, :createdAt, :userId) 
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, created_at=excluded.created_at`,
  );
  const deleteMessages = database.prepare(
    "DELETE FROM messages WHERE chat_id = :id",
  );
  const insertMessage = database.prepare(
    `INSERT INTO messages
      (id, chat_id, role, content, pending, error, created_at, edited, cost, reasoning, reasoning_details)
     VALUES (:id, :chat_id, :role, :content, :pending, :error, :created_at, :edited, :cost, :reasoning, :reasoning_details)`,
  );

  const tx = () => {
    insertChat.run({ id: chat.id, title, createdAt, userId: effectiveUserId });
    deleteMessages.run({ id: chat.id });
    for (const msg of chat.messages || []) {
      insertMessage.run({
        id: msg.id,
        chat_id: chat.id,
        role: msg.role,
        content: JSON.stringify(msg.content ?? ""),
        pending: msg.pending ? 1 : 0,
        error: msg.error || null,
        created_at: msg.createdAt ?? Date.now(),
        edited: msg.edited ? 1 : 0,
        cost: msg.cost ?? null,
        reasoning: msg.reasoning ?? null,
        reasoning_details: msg.reasoningDetails
          ? JSON.stringify(msg.reasoningDetails)
          : null,
      });
    }
  };
  runTransaction(database, tx);
}

export function deleteChat(id: string, userId?: string): boolean {
  const database = getDb();

  if (userId) {
    // Verify ownership
    const chat = database
      .prepare("SELECT user_id FROM chats WHERE id = :id LIMIT 1")
      .get({ id }) as any;
    if (!chat || chat.user_id !== userId) {
      return false;
    }
  }

  database.prepare("DELETE FROM chats WHERE id = :id").run({ id });
  return true;
}

// ============ CONFIG MANAGEMENT (USER-SCOPED) ============

export function saveConfig(config: StoredConfig, userId?: string) {
  const database = getDb();
  const insert = database.prepare(
    `INSERT INTO config (user_id, key, value) VALUES (:userId, :key, :value) 
     ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value`,
  );
  const tx = () => {
    Object.entries(config || {}).forEach(([key, value]) => {
      insert.run({ userId: userId || null, key, value: JSON.stringify(value) });
    });
  };
  runTransaction(database, tx);
}

export function loadConfig(userId?: string): StoredConfig {
  const database = getDb();

  let sql = "SELECT key, value FROM config";
  if (userId) {
    sql += " WHERE user_id = :userId";
  } else {
    sql += " WHERE user_id IS NULL";
  }

  const rows = database.prepare(sql).all(userId ? { userId } : {}) as any[];
  const out: StoredConfig = {};
  rows.forEach((row) => {
    out[row.key] = safeJsonParse(row.value);
  });
  return out;
}

// ============ BACKUP/RESTORE ============

export function backupAll(): {
  chats: StoredChat[];
  config: StoredConfig;
} {
  const chats = listChats()
    .map((c) => getChat(c.id))
    .filter(Boolean) as StoredChat[];
  const config = loadConfig();
  return { chats, config };
}

export function restoreAll(data: {
  chats?: StoredChat[];
  config?: StoredConfig;
}) {
  const database = getDb();
  const clearAll = () => {
    database.exec(
      "DELETE FROM messages; DELETE FROM chats; DELETE FROM config;",
    );
    if (data.config) saveConfig(data.config);
    for (const c of data.chats || []) {
      saveChat(c);
    }
  };
  runTransaction(database, clearAll);
}

// ============ UTILITIES ============

function deriveTitleFromMessages(messages: StoredMessage[]): string | null {
  if (!messages?.length) return null;
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const text = normalizeMessageText(firstUser);
  if (!text) return null;
  return text.slice(0, 60);
}

function normalizeMessageText(msg: StoredMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((p: any) =>
        p?.type === "text" ? p.text : p?.image_url?.url ? "[image]" : "",
      )
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function safeJsonParse(input: string | null | undefined) {
  if (!input) return "";
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

// ============ IMAGE PERSISTENCE ============

export type StoredImage = {
  id: string;
  url: string;
  prompt: string;
  model: string;
  size: string;
  steps: number;
  guidanceScale: number;
  seed?: number;
  cost?: number;
  createdAt: number;
  sourceImageUrl?: string;
  userId?: string;
};

export function saveImage(image: StoredImage, userId: string) {
  const database = getDb();
  database
    .prepare(
      `INSERT OR REPLACE INTO images 
       (id, user_id, url, prompt, model, size, steps, guidance_scale, seed, cost, created_at, source_image_url)
       VALUES (:id, :userId, :url, :prompt, :model, :size, :steps, :guidanceScale, :seed, :cost, :createdAt, :sourceImageUrl)`,
    )
    .run({
      id: image.id,
      userId,
      url: image.url,
      prompt: image.prompt || "",
      model: image.model || "",
      size: image.size || "",
      steps: image.steps || 0,
      guidanceScale: image.guidanceScale || 0,
      seed: image.seed ?? null,
      cost: image.cost ?? null,
      createdAt: image.createdAt || Date.now(),
      sourceImageUrl: image.sourceImageUrl ?? null,
    });
}

export function listImages(userId: string): StoredImage[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT * FROM images WHERE user_id = :userId ORDER BY created_at DESC`,
    )
    .all({ userId }) as any[];

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    prompt: row.prompt,
    model: row.model,
    size: row.size,
    steps: row.steps,
    guidanceScale: row.guidance_scale,
    seed: row.seed ?? undefined,
    cost: row.cost ?? undefined,
    createdAt: row.created_at,
    sourceImageUrl: row.source_image_url ?? undefined,
    userId: row.user_id,
  }));
}

export function deleteImage(imageId: string, userId: string): boolean {
  const database = getDb();
  const result = database
    .prepare(`DELETE FROM images WHERE id = :imageId AND user_id = :userId`)
    .run({ imageId, userId });
  return (result as any).changes > 0;
}

export function clearUserImages(userId: string) {
  const database = getDb();
  database
    .prepare(`DELETE FROM images WHERE user_id = :userId`)
    .run({ userId });
}

