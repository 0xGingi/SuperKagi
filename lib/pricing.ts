import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Provider } from "@/lib/env";
import { getOpenrouterPricing } from "@/lib/openrouter";

type PricingValue = number | string | null | undefined;
type PricingShape = Record<string, PricingValue> | string | null | undefined;

export type UsageRecord = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export type CostEvent = {
  id?: number;
  provider: Provider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  currency: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
};

export type CostSummary = {
  currency: string;
  totalCost: number;
  providerTotals: Record<
    Provider,
    {
      cost: number;
      count: number;
    }
  >;
  topModels: Array<{ model: string; cost: number; count: number }>;
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
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.db");
  db = createDatabase(dbPath);
  try {
    if (db.pragma) db.pragma("journal_mode = WAL");
    else db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // WAL may not be available; ignore.
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS pricing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost REAL,
      currency TEXT DEFAULT 'USD',
      created_at INTEGER,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pricing_provider_created ON pricing_events(provider, created_at);
    CREATE INDEX IF NOT EXISTS idx_pricing_model_created ON pricing_events(model, created_at);
  `);
  return db;
}

function toNumber(value: PricingValue): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (Number.isNaN(value) || value < 0) return null;
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.eE+-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function extractPricingFields(pricing: PricingShape) {
  if (!pricing || typeof pricing === "string")
    return { prompt: null, completion: null, request: null };
  return {
    prompt:
      toNumber(pricing.prompt) ??
      toNumber((pricing as any).input) ??
      toNumber((pricing as any)["1k_input"]),
    completion:
      toNumber(pricing.completion) ??
      toNumber((pricing as any).output) ??
      toNumber((pricing as any)["1k_output"]),
    request: toNumber((pricing as any).request),
  };
}

function normalizeUsage(usage: UsageRecord | undefined) {
  return {
    prompt: usage?.prompt_tokens ?? usage?.input_tokens ?? 0,
    completion: usage?.completion_tokens ?? usage?.output_tokens ?? 0,
    total: usage?.total_tokens ?? 0,
  };
}

export function calculateOpenrouterCost(
  usage: UsageRecord | undefined,
  pricing: PricingShape,
) {
  if (!usage) return null;
  const { promptTokens, completionTokens } = (() => {
    const normalized = normalizeUsage(usage);
    // If only total tokens are provided, split evenly to approximate usage.
    if (normalized.prompt || normalized.completion) {
      return {
        promptTokens: normalized.prompt,
        completionTokens: normalized.completion,
      };
    }
    const half = Math.floor((normalized.total || 0) / 2);
    return { promptTokens: half, completionTokens: normalized.total - half };
  })();

  const { prompt, completion, request } = extractPricingFields(pricing);
  if (prompt == null && completion == null && request == null) return null;

  const promptCost = prompt != null ? promptTokens * prompt : 0;
  const completionCost = completion != null ? completionTokens * completion : 0;
  const totalCost = (request ?? 0) + promptCost + completionCost;

  return {
    cost: totalCost,
    promptTokens,
    completionTokens,
  };
}

function insertCostEvent(record: Omit<CostEvent, "id">): CostEvent {
  const database = getDb();
  const insert = database.prepare(
    `INSERT INTO pricing_events
      (provider, model, prompt_tokens, completion_tokens, cost, currency, created_at, metadata)
     VALUES (:provider, :model, :prompt_tokens, :completion_tokens, :cost, :currency, :created_at, :metadata)`,
  );
  const result = insert.run({
    provider: record.provider,
    model: record.model,
    prompt_tokens: record.promptTokens ?? 0,
    completion_tokens: record.completionTokens ?? 0,
    cost: record.cost,
    currency: record.currency,
    created_at: record.createdAt ?? Date.now(),
    metadata: record.metadata ? JSON.stringify(record.metadata) : null,
  });
  return { ...record, id: Number(result.lastInsertRowid || 0) };
}

export async function recordOpenrouterCost(options: {
  model: string;
  usage?: UsageRecord;
  pricing?: PricingShape;
  apiKey?: string;
  currency?: string;
}) {
  try {
    if (!options.model || !options.usage) return null;
    const pricing =
      options.pricing ||
      (await getOpenrouterPricing(options.model, options.apiKey));
    const costInfo = calculateOpenrouterCost(options.usage, pricing);
    if (!costInfo) return null;

    return insertCostEvent({
      provider: "openrouter",
      model: options.model,
      promptTokens: costInfo.promptTokens,
      completionTokens: costInfo.completionTokens,
      cost: costInfo.cost,
      currency: options.currency || "USD",
      createdAt: Date.now(),
      metadata:
        pricing && typeof pricing !== "string" ? { pricing } : undefined,
    });
  } catch (error) {
    console.warn("[pricing] failed to record OpenRouter cost:", error);
    return null;
  }
}

export function listRecentCosts(limit = 50): CostEvent[] {
  const database = getDb();
  const stmt = database.prepare(
    `SELECT id, provider, model, prompt_tokens as promptTokens,
      completion_tokens as completionTokens, cost, currency,
      created_at as createdAt, metadata
     FROM pricing_events
     ORDER BY created_at DESC
     LIMIT :limit`,
  );
  return (stmt.all({ limit }) as any[]).map((row) => ({
    ...row,
    metadata: row.metadata ? safeJsonParse(row.metadata) : undefined,
  }));
}

export function summarizeCosts(): CostSummary {
  const database = getDb();
  const totals = database
    .prepare(
      `SELECT provider, COUNT(*) as count, COALESCE(SUM(cost), 0) as cost
       FROM pricing_events
       GROUP BY provider`,
    )
    .all() as Array<{ provider: Provider; count: number; cost: number }>;

  const providerTotals = {
    local: { cost: 0, count: 0 },
    openrouter: { cost: 0, count: 0 },
    nanogpt: { cost: 0, count: 0 },
  } as CostSummary["providerTotals"];

  let totalCost = 0;
  totals.forEach((row) => {
    if (providerTotals[row.provider]) {
      providerTotals[row.provider].cost = row.cost || 0;
      providerTotals[row.provider].count = row.count || 0;
    }
    totalCost += row.cost || 0;
  });

  const topModels = database
    .prepare(
      `SELECT model, COUNT(*) as count, COALESCE(SUM(cost), 0) as cost
       FROM pricing_events
       GROUP BY model
       ORDER BY cost DESC
       LIMIT 10`,
    )
    .all() as Array<{ model: string; count: number; cost: number }>;

  return {
    currency: "USD",
    totalCost,
    providerTotals,
    topModels,
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
