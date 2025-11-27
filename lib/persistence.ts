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

let db: any | null = null;
const require = createRequire(import.meta.url);

function getDatabaseCtor(): any {
  if ((globalThis as any).Bun) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("bun:sqlite");
    return mod.Database;
  }
  throw new Error("bun:sqlite is only available when running under Bun.");
}

function getDb() {
  if (db) return db;
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.db");
  const DatabaseCtor = getDatabaseCtor();
  db = new DatabaseCtor(dbPath, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL;");
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
      "SELECT id, title, created_at as createdAt FROM chats WHERE id = $id LIMIT 1",
    )
    .get({ $id: id }) as any;
  if (!chatRow) return null;
  const messages = database
    .prepare(
      `SELECT id, role, content, pending, error, created_at as createdAt, edited
       FROM messages WHERE chat_id = $id ORDER BY created_at ASC`,
    )
    .all({ $id: id })
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
    "INSERT INTO chats (id, title, created_at) VALUES ($id, $title, $createdAt) ON CONFLICT(id) DO UPDATE SET title=excluded.title, created_at=excluded.created_at",
  );
  const deleteMessages = database.prepare(
    "DELETE FROM messages WHERE chat_id = $id",
  );
  const insertMessage = database.prepare(
    `INSERT INTO messages
      (id, chat_id, role, content, pending, error, created_at, edited)
     VALUES ($id, $chat_id, $role, $content, $pending, $error, $created_at, $edited)`,
  );

  const tx = database.transaction(() => {
    insertChat.run({ $id: chat.id, $title: title, $createdAt: createdAt });
    deleteMessages.run({ $id: chat.id });
    for (const msg of chat.messages || []) {
      insertMessage.run({
        $id: msg.id,
        $chat_id: chat.id,
        $role: msg.role,
        $content: JSON.stringify(msg.content ?? ""),
        $pending: msg.pending ? 1 : 0,
        $error: msg.error || null,
        $created_at: msg.createdAt ?? Date.now(),
        $edited: msg.edited ? 1 : 0,
      });
    }
  });
  tx();
}

export function deleteChat(id: string) {
  const database = getDb();
  database.prepare("DELETE FROM chats WHERE id = $id").run({ $id: id });
}

export function saveConfig(config: StoredConfig) {
  const database = getDb();
  const insert = database.prepare(
    "INSERT INTO config (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  );
  const tx = database.transaction(() => {
    Object.entries(config || {}).forEach(([key, value]) => {
      insert.run({ $key: key, $value: JSON.stringify(value) });
    });
  });
  tx();
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
  const clearAll = database.transaction(() => {
    database.exec(
      "DELETE FROM messages; DELETE FROM chats; DELETE FROM config;",
    );
    if (data.config) saveConfig(data.config);
    for (const c of data.chats || []) {
      saveChat(c);
    }
  });
  clearAll();
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
