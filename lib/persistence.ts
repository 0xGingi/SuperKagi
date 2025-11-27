import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export type StoredMessage = {
  id: string;
  role: string;
  content: unknown;
  pending?: boolean;
  error?: string;
  createdAt?: number;
  edited?: boolean;
};

export type StoredChat = {
  id: string;
  title?: string;
  createdAt?: number;
  messages: StoredMessage[];
};

export type StoredConfig = Record<string, unknown>;

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
      } catch {}
    } else {
      db.exec("PRAGMA journal_mode = WAL;");
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER
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
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    return db;
  } catch (error) {
    console.error("[persistence] failed to init db:", error);
    throw error;
  }
}

function runTransaction(database: SqliteInstance, fn: () => void) {
  if (typeof database.transaction === "function") {
    return database.transaction(fn)();
  }
  // Fallback: just execute (no transactional guarantees)
  return fn();
}

export function listChats(): Array<{
  id: string;
  title: string;
  createdAt: number;
  messageCount: number;
}> {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT c.id, COALESCE(c.title, '') AS title, COALESCE(c.created_at, 0) AS createdAt,
      COUNT(m.id) AS messageCount
    FROM chats c
    LEFT JOIN messages m ON m.chat_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  return stmt.all() as any;
}

export function getChat(id: string): StoredChat | null {
  const database = getDb();
  const chatRow = database
    .prepare(
      "SELECT id, title, created_at as createdAt FROM chats WHERE id = :id LIMIT 1",
    )
    .get({ id }) as any;
  if (!chatRow) return null;
  const messages = database
    .prepare(
      `SELECT id, role, content, pending, error, created_at as createdAt, edited
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
    })) as StoredMessage[];

  return {
    id: chatRow.id,
    title: chatRow.title || undefined,
    createdAt: chatRow.createdAt || undefined,
    messages,
  };
}

export function saveChat(chat: StoredChat) {
  const database = getDb();
  const createdAt =
    chat.createdAt ??
    chat.messages?.find((m) => m.createdAt)?.createdAt ??
    Date.now();
  const title =
    chat.title ||
    deriveTitleFromMessages(chat.messages) ||
    `Chat ${chat.id.slice(-4)}`;

  const insertChat = database.prepare(
    "INSERT INTO chats (id, title, created_at) VALUES (:id, :title, :createdAt) ON CONFLICT(id) DO UPDATE SET title=excluded.title, created_at=excluded.created_at",
  );
  const deleteMessages = database.prepare(
    "DELETE FROM messages WHERE chat_id = :id",
  );
  const insertMessage = database.prepare(
    `INSERT INTO messages
      (id, chat_id, role, content, pending, error, created_at, edited)
     VALUES (:id, :chat_id, :role, :content, :pending, :error, :created_at, :edited)`,
  );

  const tx = () => {
    insertChat.run({ id: chat.id, title, createdAt });
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
      });
    }
  };
  runTransaction(database, tx);
}

export function deleteChat(id: string) {
  const database = getDb();
  database.prepare("DELETE FROM chats WHERE id = :id").run({ id });
}

export function saveConfig(config: StoredConfig) {
  const database = getDb();
  const insert = database.prepare(
    "INSERT INTO config (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  );
  const tx = () => {
    Object.entries(config || {}).forEach(([key, value]) => {
      insert.run({ key, value: JSON.stringify(value) });
    });
  };
  runTransaction(database, tx);
}

export function loadConfig(): StoredConfig {
  const database = getDb();
  const rows = database.prepare("SELECT key, value FROM config").all() as any[];
  const out: StoredConfig = {};
  rows.forEach((row) => {
    out[row.key] = safeJsonParse(row.value);
  });
  return out;
}

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
