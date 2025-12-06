import type { ChatMap, ChatMessage } from "@/types/chat";

export function createMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function messageText(
  msg: Pick<ChatMessage, "content" | "reasoning">,
  options?: { includeReasoning?: boolean },
): string {
  const includeReasoning = options?.includeReasoning ?? true;
  const content = msg.content;
  let base = "";
  if (Array.isArray(content)) {
    base = content
      .map((part) => {
        if (part.type === "text") return part.text;
        if (part.type === "image_url") return `[Image] ${part.image_url.url}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  } else {
    base = content || "";
  }
  if (includeReasoning && msg.reasoning) {
    const reason = msg.reasoning.trim();
    if (reason) base = base ? `${base}\n\n[Reasoning]\n${reason}` : reason;
  }
  return base;
}

export type StoredChat = {
  id: string;
  title?: string;
  createdAt?: number;
  messages: ChatMessage[];
};

export function threadToStored(
  id: string,
  messages: ChatMessage[],
): StoredChat {
  return {
    id,
    createdAt: Number.isFinite(Number(id)) ? Number(id) : Date.now(),
    messages: messages.map((m) => ({
      ...m,
      id: m.id || createMessageId(),
      createdAt: m.createdAt || Date.now(),
      // Ensure we keep cost/error/pending fields if needed?
      // Typically we just store what's in ChatMessage
    })),
  };
}

export function chatsArrayToMap(chats: StoredChat[]): ChatMap {
  const map: ChatMap = {};
  chats.forEach((chat) => {
    map[chat.id] = (chat.messages || []).map((m) => ({
      ...m,
      id: m.id || createMessageId(),
      createdAt: m.createdAt || chat.createdAt || Date.now(),
    }));
  });
  return map;
}

export function formatCost(cost?: number | null) {
  if (cost == null || Number.isNaN(cost)) return "";
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  if (cost >= 0.001) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}
