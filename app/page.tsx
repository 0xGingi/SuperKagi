"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { exportChat } from "@/lib/export";
import {
  type CustomShortcuts,
  formatShortcutDisplay,
  isShortcutValid,
  loadCustomShortcuts,
  parseKeyboardEvent,
  SHORTCUT_CONFIGS,
  saveCustomShortcuts,
  useKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts";
import { useTheme } from "@/lib/theme";

const MarkdownRenderer = dynamic(
  () =>
    import("@/components/markdown-renderer").then(
      (mod) => mod.MarkdownRenderer,
    ),
  {
    ssr: false,
    loading: () => <div className="markdown-loading">Rendering…</div>,
  },
);

export type Provider = "local" | "openrouter" | "nanogpt";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string | ContentPart[];
  id?: string;
  pending?: boolean;
  error?: string;
  createdAt?: number;
  edited?: boolean;
  tool_call_id?: string;
};

export type ChatMap = Record<string, ChatMessage[]>;

export type UiConfig = {
  provider: Provider;
  model: string;
  models: { local: string; openrouter: string; nanogpt: string };
  imageModel: string;
  imageSize: string;
  imageSteps: number;
  imageGuidanceScale: number;
  imageSeed?: number;
  apiKey?: string;
  localUrl: string;
  systemPrompt: string;
  deepSearch: boolean;
  userSet?: {
    provider?: boolean;
    models?: { local?: boolean; openrouter?: boolean; nanogpt?: boolean };
    imageModel?: boolean;
    imageSize?: boolean;
    imageSteps?: boolean;
    imageGuidanceScale?: boolean;
    imageSeed?: boolean;
    localUrl?: boolean;
    systemPrompt?: boolean;
    deepSearch?: boolean;
    apiKey?: boolean;
  };
};

const defaultModels = {
  local: "llama3",
  openrouter: "openrouter/auto",
  nanogpt: "moonshotai/kimi-k2-thinking",
};
const defaultImageModel = "chroma";

const nanoImageModels = [
  {
    id: "chroma",
    name: "Chroma",
    pricing: "$0.009/img",
    resolutions: [
      "1024x1024",
      "512x512",
      "768x1024",
      "576x1024",
      "1024x768",
      "1024x576",
    ],
  },
  {
    id: "hidream",
    name: "Hidream",
    pricing: "$0.014/img",
    resolutions: [
      "1024x1024",
      "768x1360",
      "1360x768",
      "880x1168",
      "1168x880",
      "1248x832",
      "832x1248",
    ],
  },
  {
    id: "artiwaifu-diffusion",
    name: "Juggernaut XL",
    pricing: "$0.003-$0.006/img",
    resolutions: [
      "1024x1024",
      "1920x1088",
      "1088x1920",
      "768x1024",
      "1024x768",
      "1408x1024",
      "1024x1408",
      "512x512",
      "2048x2048",
    ],
  },
  {
    id: "qwen-image",
    name: "Qwen Image",
    pricing: "$0.009/img",
    resolutions: [
      "auto",
      "1024x1024",
      "512x512",
      "768x1024",
      "576x1024",
      "1024x768",
      "1024x576",
    ],
  },
];

const fallbackDefaults = {
  provider: "local" as Provider,
  modelLocal: defaultModels.local,
  modelOpenrouter: defaultModels.openrouter,
  modelNanogpt: defaultModels.nanogpt,
  imageModelNanogpt: defaultImageModel,
  hasApiKey: false,
  hasNanoApiKey: false,
  localUrl: "http://host.docker.internal:11434/api/chat",
  systemPrompt: "",
  deepSearch: false,
};
const deepSearchPrompt =
  "\nUse web search/browsing MCP tools to gather and verify up-to-date information. Prefer calling tools to fetch pages; summarize with concise bullet points and include source names.";

const initialConfig: UiConfig = {
  provider: fallbackDefaults.provider,
  model:
    fallbackDefaults.provider === "openrouter"
      ? fallbackDefaults.modelOpenrouter
      : fallbackDefaults.modelLocal,
  models: {
    local: fallbackDefaults.modelLocal,
    openrouter: fallbackDefaults.modelOpenrouter,
    nanogpt: fallbackDefaults.modelNanogpt,
  },
  imageModel: fallbackDefaults.imageModelNanogpt,
  imageSize: "1024x1024",
  imageSteps: 30,
  imageGuidanceScale: 7.5,
  apiKey: "",
  localUrl: fallbackDefaults.localUrl,
  systemPrompt: fallbackDefaults.systemPrompt,
  deepSearch: fallbackDefaults.deepSearch,
  userSet: { models: {} },
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function createMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function messageText(content: ChatMessage["content"]): string {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === "text") return part.text;
        if (part.type === "image_url") return `[Image] ${part.image_url.url}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return content || "";
}

type StoredChat = {
  id: string;
  title?: string;
  createdAt?: number;
  messages: ChatMessage[];
};

function threadToStored(id: string, messages: ChatMessage[]): StoredChat {
  return {
    id,
    createdAt: Number.isFinite(Number(id)) ? Number(id) : Date.now(),
    messages: messages.map((m) => ({
      ...m,
      id: m.id || createMessageId(),
      createdAt: m.createdAt || Date.now(),
    })),
  };
}

function chatsArrayToMap(chats: StoredChat[]): ChatMap {
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

function resolveProvider(value?: string): Provider {
  if (value === "openrouter" || value === "nanogpt") return value;
  return "local";
}

function mergeEnvDefaults(
  _current: UiConfig,
  existing: UiConfig,
  env: typeof fallbackDefaults,
): UiConfig {
  const base = { ...initialConfig, ...existing } as UiConfig;
  const envModels = {
    local: env.modelLocal || fallbackDefaults.modelLocal,
    openrouter: env.modelOpenrouter || fallbackDefaults.modelOpenrouter,
    nanogpt: env.modelNanogpt || fallbackDefaults.modelNanogpt,
  };

  const userSet = base.userSet || { models: {} };
  if (!userSet.models) userSet.models = {};

  const models = { ...envModels };
  if (existing.models?.local && userSet.models.local)
    models.local = existing.models.local;
  if (existing.models?.openrouter && userSet.models.openrouter)
    models.openrouter = existing.models.openrouter;
  if (existing.models?.nanogpt && userSet.models.nanogpt)
    models.nanogpt = existing.models.nanogpt;

  const provider = resolveProvider(existing.provider || env.provider);
  const model =
    existing.model ||
    models[provider as keyof typeof models] ||
    (provider === "openrouter"
      ? models.openrouter
      : provider === "nanogpt"
        ? models.nanogpt
        : models.local);

  return {
    ...base,
    models,
    provider,
    model,
    imageModel:
      existing.imageModel || env.imageModelNanogpt || defaultImageModel,
    imageSize: existing.imageSize || "1024x1024",
    imageSteps: existing.imageSteps || 30,
    imageGuidanceScale: existing.imageGuidanceScale || 7.5,
    imageSeed: existing.imageSeed,
    localUrl: existing.localUrl || env.localUrl,
    systemPrompt: existing.systemPrompt ?? env.systemPrompt,
    deepSearch:
      typeof existing.deepSearch === "boolean"
        ? existing.deepSearch
        : env.deepSearch,
    userSet,
  };
}

export default function Page() {
  const [serverDefaults, setServerDefaults] = useState(fallbackDefaults);
  const [config, setConfig] = useState<UiConfig>(initialConfig);
  const [chats, setChats] = useState<ChatMap>({});
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [heroValue, setHeroValue] = useState("");
  const [composerValue, setComposerValue] = useState("");
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    ok?: boolean;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [nanoModels, setNanoModels] = useState<
    { id: string; label: string; pricing?: string }[]
  >([]);
  const [nanoModelQuery, setNanoModelQuery] = useState("");
  const [nanoModelsStatus, setNanoModelsStatus] = useState("");
  const [nanoModelsLoading, setNanoModelsLoading] = useState(false);
  const [openrouterModels, setOpenrouterModels] = useState<
    { id: string; label: string; pricing?: string }[]
  >([]);
  const [openrouterModelQuery, setOpenrouterModelQuery] = useState("");
  const [openrouterModelsStatus, setOpenrouterModelsStatus] = useState("");
  const [openrouterModelsLoading, setOpenrouterModelsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [imageSettingsExpanded, setImageSettingsExpanded] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"settings" | "shortcuts">(
    "settings",
  );
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcuts>({});
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [recordingKey, setRecordingKey] = useState<string>("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const [messageSearch, setMessageSearch] = useState("");
  const [persistLoaded, setPersistLoaded] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const swRegisteredRef = useRef(false);

  const heroInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedConfig = safeParseLocal<UiConfig>("config");
    const storedChats = safeParseLocal<ChatMap>("chats");
    const storedCurrent = localStorage.getItem("currentChatId") || "";
    if (storedConfig)
      setConfig((prev) =>
        mergeEnvDefaults(prev, storedConfig, fallbackDefaults),
      );
    if (storedChats) setChats(storedChats);
    if (storedCurrent) setCurrentChatId(storedCurrent);

    fetch("/api/config-defaults")
      .then((r) => r.json())
      .then((data) => {
        setServerDefaults(data);
        setConfig((prev) => mergeEnvDefaults(prev, prev, data));
      })
      .catch(() => undefined);

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (swRegisteredRef.current) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        swRegisteredRef.current = true;
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        const cfgRes = await fetch("/api/persistence/config", {
          cache: "no-store",
        });
        if (cfgRes.ok) {
          const data = await cfgRes.json();
          if (data?.config) {
            setConfig((prev) =>
              mergeEnvDefaults(
                prev,
                { ...prev, ...(data.config as Partial<UiConfig>) },
                serverDefaults,
              ),
            );
          }
        }
      } catch {}

      try {
        const chatRes = await fetch("/api/persistence/chats", {
          cache: "no-store",
        });
        if (chatRes.ok) {
          const data = await chatRes.json();
          if (Array.isArray(data?.chats)) {
            const mapped = chatsArrayToMap(data.chats);
            if (Object.keys(mapped).length) {
              setChats((prev) => ({ ...mapped, ...prev }));
              const firstId =
                localStorage.getItem("currentChatId") ||
                Object.keys(mapped)[0] ||
                "";
              if (firstId) setCurrentChatId(firstId);
            }
          }
        }
      } catch {}
      setPersistLoaded(true);
    })();
  }, [hydrated, serverDefaults]);

  useEffect(() => {
    if (!hydrated) return;
    setChats((prev) => {
      let changed = false;
      const next: ChatMap = {};
      Object.entries(prev).forEach(([id, msgs]) => {
        next[id] = (msgs || []).map((m, idx) => {
          if (m.id) return m;
          changed = true;
          return {
            ...m,
            id: `${id}-${idx}`,
            createdAt: m.createdAt || Date.now(),
          };
        });
      });
      return changed ? next : prev;
    });
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (currentChatId) {
      if (!chats[currentChatId]) {
        setChats((prev) => ({
          ...prev,
          [currentChatId]: prev[currentChatId] || [],
        }));
      }
      return;
    }

    const ids = Object.keys(chats);
    if (ids.length) {
      const nextId = ids.sort().reverse()[0];
      setCurrentChatId(nextId);
      try {
        localStorage.setItem("currentChatId", nextId);
      } catch {}
      if (!chats[nextId]) setChats((prev) => ({ ...prev, [nextId]: [] }));
      return;
    }

    const id = Date.now().toString();
    setCurrentChatId(id);
    setChats((prev) => ({ ...prev, [id]: [] }));
    try {
      localStorage.setItem("currentChatId", id);
    } catch {}
  }, [currentChatId, chats, hydrated]);

  useEffect(() => {
    try {
      localStorage.setItem("config", JSON.stringify(config));
    } catch {}
  }, [config]);

  useEffect(() => {
    if (!hydrated || !persistLoaded) return;
    const timer = setTimeout(() => {
      fetch("/api/persistence/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [config, hydrated, persistLoaded]);

  useEffect(() => {
    try {
      localStorage.setItem("chats", JSON.stringify(chats));
    } catch {}
  }, [chats]);

  useEffect(() => {
    if (!hydrated || !persistLoaded) return;
    const thread = chats[currentChatId] || [];
    if (!thread.length) return;
    const payload = threadToStored(currentChatId, thread);
    const timer = setTimeout(() => {
      fetch("/api/persistence/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [chats, currentChatId, hydrated, persistLoaded]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      const added = await Promise.all(files.map(readAttachment));
      setAttachments((prev) => [...prev, ...(added.filter(Boolean) as any[])]);
    };

    const onPaste = async (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      const activeId = (document.activeElement as HTMLElement | null)?.id || "";
      const isChatInput = activeId === "input" || activeId === "composer-input";

      if (files.length) {
        e.preventDefault();
        const added = await Promise.all(files.map(readAttachment));
        setAttachments((prev) => [
          ...prev,
          ...(added.filter(Boolean) as any[]),
        ]);
        return;
      }

      const text = e.clipboardData?.getData("text");
      if (text?.trim() && !isChatInput) {
        setAttachments((prev) => [
          ...prev,
          { kind: "text", name: "pasted.txt", text },
        ]);
      }
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    const classMap = {
      "sidebar-collapsed": sidebarCollapsed,
      "modal-open": showConfig,
      "no-scroll": showConfig || sidebarOpen,
    };
    Object.entries(classMap).forEach(([cls, on]) => {
      body.classList.toggle(cls, !!on);
    });
    return () => {
      Object.keys(classMap).forEach((cls) => {
        body.classList.remove(cls);
      });
    };
  }, [showConfig, sidebarOpen, sidebarCollapsed]);

  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    if (stored === "true") setSidebarCollapsed(true);

    const onResize = () => {
      if (window.innerWidth <= 780 && sidebarCollapsed) {
        setSidebarCollapsed(false);
        localStorage.setItem("sidebarCollapsed", "false");
      }
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (config.provider === "nanogpt" && !nanoModelsStatus) {
      setNanoModelsStatus(
        "Load subscription-only models using your NanoGPT API key.",
      );
    }
    if (config.provider === "openrouter" && !openrouterModelsStatus) {
      setOpenrouterModelsStatus(
        "Load available models using your OpenRouter API key.",
      );
    }
  }, [config.provider, nanoModelsStatus, openrouterModelsStatus]);

  // Load custom shortcuts
  useEffect(() => {
    const loaded = loadCustomShortcuts();
    setCustomShortcuts(loaded);
  }, []);

  // Merge custom shortcuts with defaults
  const activeShortcuts = useMemo(() => {
    const merged: Record<string, string> = {};
    SHORTCUT_CONFIGS.forEach((config) => {
      const key = customShortcuts[config.action] || config.defaultKey;
      merged[key] = config.action;
    });
    return merged;
  }, [customShortcuts]);

  // Keyboard shortcuts
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    if (!editingMessageId) return;
    editInputRef.current?.focus();
  }, [editingMessageId]);

  // Create shortcut handlers map
  // biome-ignore lint/correctness/useExhaustiveDependencies: Functions are stable and defined below
  const shortcutHandlers: Record<string, () => void> = useMemo(
    () => ({
      NEW_CHAT: newChat,
      TOGGLE_SIDEBAR: handleSidebarToggle,
      TOGGLE_CONFIG: () => setShowConfig(!showConfig),
      TOGGLE_DEEP_SEARCH: toggleDeepSearch,
      FOCUS_SEARCH: () => {
        const searchInput = document.getElementById(
          "chat-search",
        ) as HTMLInputElement;
        searchInput?.focus();
      },
      FOCUS_THREAD_SEARCH: () => {
        const searchInput = document.getElementById(
          "thread-search-input",
        ) as HTMLInputElement;
        searchInput?.focus();
      },
      TOGGLE_THEME: () => {
        setTheme(
          theme === "dark" ? "light" : theme === "light" ? "dark" : "system",
        );
      },
      EXPORT_CHAT: () => {
        const currentThread = chats[currentChatId] || [];
        if (currentThread.length > 0) {
          exportChat(currentChatId, currentThread, "markdown");
        }
      },
    }),
    [theme, setTheme, showConfig, currentChatId, chats],
  );

  // Build the actual shortcuts object for useKeyboardShortcuts
  const shortcuts = useMemo(() => {
    const result: Record<string, () => void> = {};
    Object.entries(activeShortcuts).forEach(([key, action]) => {
      if (shortcutHandlers[action]) {
        result[key] = shortcutHandlers[action];
      }
    });
    return result;
  }, [activeShortcuts, shortcutHandlers]);

  useKeyboardShortcuts(shortcuts);

  useEffect(() => {
    if (!editingMessageId) return;
    editInputRef.current?.focus();
  }, [editingMessageId]);

  function handleSidebarToggle() {
    if (window.innerWidth <= 780) {
      setSidebarOpen((v) => !v);
      return;
    }
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", String(next));
      } catch {}
      return next;
    });
  }

  const thread = useMemo(
    () => chats[currentChatId] || [],
    [chats, currentChatId],
  );
  const isEmpty = thread.length === 0;

  const visibleThread = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    if (!q) return thread;
    return thread.filter((m) =>
      messageText(m.content).toLowerCase().includes(q),
    );
  }, [thread, messageSearch]);

  const searchActive = !!messageSearch.trim();

  function formatMessageTime(msg: ChatMessage) {
    const ts =
      msg.createdAt ||
      (currentChatId ? parseInt(currentChatId, 10) : Date.now());
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const totalCount = thread.length;
  const visibleCount = visibleThread.length;

  function _focusActiveInput() {
    const useComposer = !isEmpty;
    if (useComposer) composerInputRef.current?.focus();
    else heroInputRef.current?.focus();
  }

  function getActiveModel() {
    return (
      config.models?.[config.provider] ||
      config.model ||
      (config.provider === "openrouter"
        ? defaultModels.openrouter
        : config.provider === "nanogpt"
          ? defaultModels.nanogpt
          : defaultModels.local)
    );
  }

  function buildPayload(messages: ChatMessage[]) {
    return {
      messages,
      provider: config.provider,
      model: getActiveModel(),
      apiKey: config.apiKey,
      localUrl: config.localUrl,
      systemPrompt:
        (config.systemPrompt || "") +
        (config.deepSearch ? deepSearchPrompt : ""),
      deepSearch: config.deepSearch,
    };
  }

  function buildUserContentParts(text: string) {
    const parts: ContentPart[] = [];
    if (text?.trim()) parts.push({ type: "text", text });
    const provider = config.provider;
    for (const a of attachments) {
      if (a.kind === "image") {
        if (provider === "openrouter" || provider === "nanogpt")
          parts.push({ type: "image_url", image_url: { url: a.url } });
        else parts.push({ type: "text", text: `[Image attached: ${a.name}]` });
      } else if (a.kind === "text") {
        parts.push({ type: "text", text: `File ${a.name}:\n${a.text}` });
      } else if (a.kind === "note") {
        parts.push({ type: "text", text: a.text });
      }
    }
    if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
    return parts;
  }

  async function sendMessage(source: "hero" | "composer") {
    const text = source === "hero" ? heroValue.trim() : composerValue.trim();
    let message = text;
    if (config.deepSearch) {
      const lower = message.toLowerCase();
      if (!lower.startsWith("search for:") && !lower.startsWith("search:")) {
        message =
          attachments.length && !message
            ? "Search for: information related to the attached files"
            : `Search for: ${message}`;
      }
    }
    if (!message && attachments.length === 0) return;

    setProviderError(null);
    setHeroValue("");
    setComposerValue("");

    const userContent = buildUserContentParts(message);
    const chatId = currentChatId || Date.now().toString();
    const userMsg: ChatMessage = {
      role: "user",
      content: userContent,
      id: createMessageId(),
      createdAt: Date.now(),
    };
    const assistantId = createMessageId();
    const pending: ChatMessage = {
      role: "assistant",
      content: "",
      pending: true,
      id: assistantId,
      createdAt: Date.now(),
    };

    const nextThread = (chats[chatId] ? [...chats[chatId]] : []).concat(
      userMsg,
      pending,
    );

    setChats((prev) => ({ ...prev, [chatId]: nextThread }));
    setAttachments([]);
    setSidebarOpen(false);

    const messagesToSend = threadWithoutPending(nextThread);
    const payload = buildPayload(messagesToSend);

    await streamAssistantResponse(chatId, payload, assistantId);
  }

  function threadWithoutPending(
    existing: ChatMessage[] | undefined,
  ): ChatMessage[] {
    return (existing || []).filter((m) => !m.pending);
  }

  async function streamAssistantResponse(
    chatId: string,
    payload: any,
    targetAssistantId?: string,
  ) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setProviderError(
          `Streaming failed (${res.status || "network error"}) — retrying fallback.`,
        );
        await fallbackToSingle(chatId, payload, targetAssistantId);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      let finished = false;
      let hasContent = false;

      const update = (finalize = false, errorText?: string) => {
        setChats((prev) => {
          const thread = [...(prev[chatId] || [])];
          const idx =
            targetAssistantId != null
              ? thread.findIndex((m) => m.id === targetAssistantId)
              : thread.length - 1;
          if (idx >= 0 && thread[idx]?.role === "assistant") {
            thread[idx] = {
              ...thread[idx],
              role: "assistant",
              content: assembled,
              pending: !finalize,
              error: errorText,
            };
          }
          return { ...prev, [chatId]: thread };
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard pattern for parsing stream chunks
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payloadLine = line.slice(6).trim();
          if (payloadLine === "[DONE]") {
            finished = true;
            break;
          }
          try {
            const data = JSON.parse(payloadLine);
            if (data?.error) {
              update(true, data.error);
              await fallbackToSingle(chatId, payload, targetAssistantId);
              return;
            }
            if (typeof data.content === "string") {
              assembled += data.content;
              hasContent = hasContent || !!data.content.length;
              update(false);
            }
          } catch {}
        }
        if (finished) break;
      }
      if (!hasContent) {
        await fallbackToSingle(chatId, payload, targetAssistantId);
        return;
      }
      update(true);
    } catch (_err) {
      setProviderError("Streaming error — retrying fallback.");
      await fallbackToSingle(chatId, payload, targetAssistantId);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fallbackToSingle(
    chatId: string,
    payload: any,
    targetAssistantId?: string,
  ) {
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { content } = await r.json();
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx =
          targetAssistantId != null
            ? thread.findIndex((m) => m.id === targetAssistantId)
            : thread.length - 1;
        if (idx >= 0 && thread[idx]?.role === "assistant") {
          thread[idx] = {
            ...thread[idx],
            role: "assistant",
            content,
            pending: false,
            error: undefined,
          };
        }
        return { ...prev, [chatId]: thread };
      });
    } catch (e) {
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx =
          targetAssistantId != null
            ? thread.findIndex((m) => m.id === targetAssistantId)
            : thread.length - 1;
        if (idx >= 0 && thread[idx]?.role === "assistant") {
          thread[idx] = {
            ...thread[idx],
            role: "assistant",
            content: `Error: ${(e as Error).message}`,
            pending: false,
            error: (e as Error).message,
          };
        }
        return { ...prev, [chatId]: thread };
      });
      setProviderError((e as Error).message || "Request failed.");
    }
  }

  function copyMessage(msg: ChatMessage) {
    const text = messageText(msg.content);
    if (!text) return;
    const id = msg.id || "copied";
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1200);
      })
      .catch(() => undefined);
  }

  function startEditMessage(msg: ChatMessage) {
    if (msg.role !== "user") return;
    const id = msg.id || createMessageId();
    if (!msg.id && currentChatId) {
      setChats((prev) => {
        const thread = [...(prev[currentChatId] || [])];
        const idx = thread.indexOf(msg);
        if (idx !== -1) {
          thread[idx] = { ...thread[idx], id };
          return { ...prev, [currentChatId]: thread };
        }
        return prev;
      });
    }
    setEditingMessageId(id);
    setEditDraft(messageText(msg.content));
  }

  function cancelEditMessage() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  async function saveEditedMessage() {
    if (!editingMessageId || !currentChatId) return;
    const thread = chats[currentChatId] || [];
    const userIdx = thread.findIndex((m) => m.id === editingMessageId);
    if (userIdx === -1) return;

    const pendingId = createMessageId();
    const updatedUser: ChatMessage = {
      ...thread[userIdx],
      content: editDraft,
      edited: true,
      pending: false,
      error: undefined,
    };

    const assistantIdx = thread.findIndex(
      (m, idx) => idx > userIdx && m.role === "assistant",
    );
    let nextThread =
      assistantIdx !== -1
        ? thread.slice(0, assistantIdx)
        : thread.slice(0, userIdx + 1);

    nextThread[userIdx] = updatedUser;
    nextThread = nextThread.concat({
      role: "assistant",
      content: "",
      pending: true,
      id: pendingId,
      createdAt: Date.now(),
    });

    setChats((prev) => ({ ...prev, [currentChatId]: nextThread }));
    setEditingMessageId(null);
    setEditDraft("");

    const messagesToSend = threadWithoutPending(nextThread);
    const payload = buildPayload(messagesToSend);
    await streamAssistantResponse(currentChatId, payload, pendingId);
  }

  async function regenerateAssistant(messageId: string) {
    if (!messageId || !currentChatId) return;
    const thread = chats[currentChatId] || [];
    const targetIdx = thread.findIndex((m) => m.id === messageId);
    if (targetIdx === -1) return;

    const pendingId = createMessageId();
    const nextThread = thread.slice(0, targetIdx).concat({
      ...thread[targetIdx],
      id: pendingId,
      content: "",
      pending: true,
      error: undefined,
    });

    setChats((prev) => ({ ...prev, [currentChatId]: nextThread }));
    setRegeneratingId(messageId);
    const messagesToSend = threadWithoutPending(nextThread);
    const payload = buildPayload(messagesToSend);
    try {
      await streamAssistantResponse(currentChatId, payload, pendingId);
    } finally {
      setRegeneratingId(null);
    }
  }

  async function generateImage(source: "hero" | "composer") {
    const text = source === "hero" ? heroValue.trim() : composerValue.trim();
    if (!text) return;

    if (config.provider !== "nanogpt") {
      alert("Image generation is only available with the NanoGPT provider.");
      return;
    }

    setHeroValue("");
    setComposerValue("");
    setIsGeneratingImage(true);
    setProviderError(null);

    const chatId = currentChatId || Date.now().toString();
    const userMsg: ChatMessage = {
      role: "user",
      content: `[Image] Generate: ${text}`,
      id: createMessageId(),
      createdAt: Date.now(),
    };
    const assistantId = createMessageId();
    const pending: ChatMessage = {
      role: "assistant",
      content: "",
      pending: true,
      id: assistantId,
      createdAt: Date.now(),
    };

    const nextThread = (chats[chatId] ? [...chats[chatId]] : []).concat(
      userMsg,
      pending,
    );

    setChats((prev) => ({ ...prev, [chatId]: nextThread }));
    setSidebarOpen(false);

    try {
      const res = await fetch("/api/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          model: config.imageModel || defaultImageModel,
          size: config.imageSize,
          num_inference_steps: config.imageSteps,
          guidance_scale: config.imageGuidanceScale,
          seed: config.imageSeed,
          apiKey: config.apiKey,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.images?.[0]?.url) {
        const errorMsg =
          data.error || data.details || "Image generation failed";
        setChats((prev) => {
          const thread = [...(prev[chatId] || [])];
          const idx = thread.findIndex((m) => m.id === assistantId);
          if (idx >= 0 && thread[idx]?.role === "assistant") {
            thread[idx] = {
              ...thread[idx],
              role: "assistant",
              content: `Error: ${errorMsg}`,
              pending: false,
              error: errorMsg,
            };
          }
          return { ...prev, [chatId]: thread };
        });
        setProviderError(errorMsg);
        return;
      }

      const imageUrl = data.images[0].url;
      const imageContent: ContentPart[] = [
        { type: "image_url", image_url: { url: imageUrl } },
      ];
      if (data.cost) {
        imageContent.push({
          type: "text",
          text: `Cost: $${data.cost.toFixed(4)}`,
        });
      }

      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx = thread.findIndex((m) => m.id === assistantId);
        if (idx >= 0 && thread[idx]?.role === "assistant") {
          thread[idx] = {
            ...thread[idx],
            role: "assistant",
            content: imageContent,
            pending: false,
            error: undefined,
          };
        }
        return { ...prev, [chatId]: thread };
      });
    } catch (e) {
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx = thread.findIndex((m) => m.id === assistantId);
        if (idx >= 0 && thread[idx]?.role === "assistant") {
          thread[idx] = {
            ...thread[idx],
            role: "assistant",
            content: `Error: ${(e as Error).message}`,
            pending: false,
            error: (e as Error).message,
          };
        }
        return { ...prev, [chatId]: thread };
      });
      setProviderError((e as Error).message || "Image request failed.");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  function newChat() {
    const empty = Object.keys(chats).find(
      (id) => (chats[id] || []).length === 0,
    );
    const id = Date.now().toString();
    const nextChats = { ...chats } as ChatMap;
    if (empty) {
      nextChats[id] = nextChats[empty];
      delete nextChats[empty];
    } else {
      nextChats[id] = [];
    }
    setChats(nextChats);
    setCurrentChatId(id);
    localStorage.setItem("currentChatId", id);
    setSidebarOpen(false);
  }

  function deleteChat(id: string) {
    const next = { ...chats } as ChatMap;
    delete next[id];
    setChats(next);
    fetch(`/api/persistence/chats/${id}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    if (currentChatId === id) {
      const ids = Object.keys(next).sort().reverse();
      const nextId = ids[0] || Date.now().toString();
      setCurrentChatId(nextId);
      if (!next[nextId]) setChats((prev) => ({ ...prev, [nextId]: [] }));
      localStorage.setItem("currentChatId", nextId);
    }
  }

  function switchChat(id: string) {
    setCurrentChatId(id);
    localStorage.setItem("currentChatId", id);
    setSidebarOpen(false);
  }

  function renderMessageContent(msg: ChatMessage) {
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((part) => part.type === "text")
        .map((part) => part.text || "")
        .join("\n");

      const imageParts = msg.content.filter(
        (part) => part.type === "image_url",
      );

      return (
        <div>
          {textParts && <MarkdownRenderer content={textParts} />}
          {imageParts.map((part) => (
            <Image
              key={part.image_url.url}
              src={part.image_url.url}
              alt="Generated content"
              className="markdown-image"
              unoptimized
              width={1024}
              height={1024}
              style={{ width: "100%", height: "auto" }}
            />
          ))}
        </div>
      );
    }

    return <MarkdownRenderer content={msg.content || ""} />;
  }

  function toggleDeepSearch() {
    setConfig((prev) => ({
      ...prev,
      deepSearch: !prev.deepSearch,
      userSet: {
        ...(prev.userSet || { models: {} }),
        deepSearch: !prev.deepSearch,
      },
    }));
  }

  function formatNanoPricing(model: any) {
    const pricing =
      (model && (model.pricing || model.prices || model.price)) || null;
    if (!pricing) return "";
    if (typeof pricing === "string") return pricing;
    const prompt =
      pricing.prompt ??
      pricing.input ??
      pricing.input_text ??
      pricing.request ??
      pricing["1k_input"];
    const completion =
      pricing.completion ??
      pricing.output ??
      pricing.output_text ??
      pricing.response ??
      pricing["1k_output"];
    if (prompt && completion) return `${prompt}/${completion}`;
    if (prompt) return `in ${prompt}`;
    if (completion) return `out ${completion}`;
    return "";
  }

  function formatOpenrouterPricing(model: any) {
    const pricing = model?.pricing || null;
    if (!pricing) return "";
    if (typeof pricing === "string") return pricing;
    const prompt = pricing.prompt || pricing.input || pricing["1k_input"];
    const completion = pricing.completion || pricing.output || pricing["1k_output"];
    if (prompt && completion) return `${prompt}/${completion}`;
    if (prompt) return `in ${prompt}`;
    if (completion) return `out ${completion}`;
    return "";
  }

  function normalizeNanoModels(
    list: any[],
  ): { id: string; label: string; pricing?: string }[] {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") return { id: item, label: item };
        if (typeof item !== "object") return null;
        const id =
          (item as any).id || (item as any).model || (item as any).name;
        if (!id) return null;
        const pricing = formatNanoPricing(item);
        const label = pricing ? `${id} · ${pricing}` : String(id);
        return { id: String(id), label, pricing };
      })
      .filter(Boolean) as { id: string; label: string; pricing?: string }[];
  }

  function normalizeOpenrouterModels(
    list: any[],
  ): { id: string; label: string; pricing?: string }[] {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const id = item.id || item.model || item.name;
        if (!id) return null;
        const pricing = formatOpenrouterPricing(item);
        const label = pricing ? `${id} · ${pricing}` : String(id);
        return { id: String(id), label, pricing };
      })
      .filter(Boolean) as { id: string; label: string; pricing?: string }[];
  }

  function applyNanoModel(id: string) {
    setConfig((prev) => ({
      ...prev,
      model: id,
      models: { ...prev.models, nanogpt: id },
      userSet: {
        ...(prev.userSet || { models: {} }),
        models: { ...(prev.userSet?.models || {}), nanogpt: true },
      },
    }));
  }

  function applyOpenrouterModel(id: string) {
    setConfig((prev) => ({
      ...prev,
      model: id,
      models: { ...prev.models, openrouter: id },
      userSet: {
        ...(prev.userSet || { models: {} }),
        models: { ...(prev.userSet?.models || {}), openrouter: true },
      },
    }));
  }

  async function fetchNanoModels() {
    setNanoModelsLoading(true);
    setNanoModelsStatus("Fetching NanoGPT subscription models…");
    try {
      const res = await fetch("/api/nanogpt/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: config.apiKey, detailed: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNanoModels([]);
        setNanoModelsStatus(
          data?.error ? String(data.error) : `Request failed (${res.status})`,
        );
        return;
      }
      const normalized = normalizeNanoModels(
        data?.models || data?.raw?.data || data?.raw || [],
      );
      setNanoModels(normalized);
      setNanoModelsStatus(
        normalized.length
          ? `Loaded ${normalized.length} models.`
          : "No models returned. Check subscription/API key.",
      );
    } catch (error) {
      setNanoModels([]);
      setNanoModelsStatus(`Failed: ${(error as Error).message}`);
    } finally {
      setNanoModelsLoading(false);
    }
  }

  async function fetchOpenrouterModels() {
    setOpenrouterModelsLoading(true);
    setOpenrouterModelsStatus("Fetching OpenRouter models…");
    try {
      const res = await fetch("/api/openrouter/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: config.apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOpenrouterModels([]);
        setOpenrouterModelsStatus(
          data?.error ? String(data.error) : `Request failed (${res.status})`,
        );
        return;
      }
      const normalized = normalizeOpenrouterModels(
        data?.models || data?.raw?.data || data?.raw || [],
      );
      setOpenrouterModels(normalized);
      setOpenrouterModelsStatus(
        normalized.length
          ? `Loaded ${normalized.length} models.`
          : "No models returned. Check API key.",
      );
    } catch (error) {
      setOpenrouterModels([]);
      setOpenrouterModelsStatus(`Failed: ${(error as Error).message}`);
    } finally {
      setOpenrouterModelsLoading(false);
    }
  }

  function setProvider(value: Provider) {
    setConfig((prev) => {
      const models = prev.models ? { ...prev.models } : { ...defaultModels };
      const currentProv = prev.provider || "local";
      if (!models[currentProv])
        models[currentProv] =
          prev.model ||
          defaultModels[currentProv as keyof typeof defaultModels];
      const nextModel = models[value] || prev.model || defaultModels[value];
      return { ...prev, provider: value, model: nextModel, models };
    });
  }

  function saveConfigFromModal() {
    setConfig((prev) => {
      const provider = prev.provider;
      const models = { ...defaultModels, ...prev.models };
      const next: UiConfig = {
        ...prev,
        provider,
        model: models[provider],
        models,
        userSet: {
          provider: provider !== serverDefaults.provider,
          models: {
            local: models.local !== serverDefaults.modelLocal,
            openrouter: models.openrouter !== serverDefaults.modelOpenrouter,
            nanogpt: models.nanogpt !== serverDefaults.modelNanogpt,
          },
          imageModel:
            prev.imageModel !==
            (serverDefaults.imageModelNanogpt || defaultImageModel),
          imageSize: prev.imageSize !== "1024x1024",
          imageSteps: prev.imageSteps !== 30,
          imageGuidanceScale: prev.imageGuidanceScale !== 7.5,
          imageSeed: prev.imageSeed !== undefined,
          localUrl: prev.localUrl !== serverDefaults.localUrl,
          systemPrompt: prev.systemPrompt !== serverDefaults.systemPrompt,
          deepSearch: prev.deepSearch !== serverDefaults.deepSearch,
          apiKey: !!prev.apiKey,
        },
      };
      return next;
    });
    setShowConfig(false);
  }

  async function testConnection() {
    setIsTesting(true);
    setStatusMsg({ text: "Testing…" });
    try {
      const payload = {
        provider: config.provider,
        apiKey: config.apiKey,
        localUrl: config.localUrl,
      };
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const ok = !!data.provider?.ok && !!data.mcp?.ok;
      const details = `Provider: ${data.provider?.ok ? "OK" : "Fail"} • MCP: ${data.mcp?.ok ? "OK" : "Fail"}`;
      setStatusMsg({ text: details, ok });
    } catch (e) {
      setStatusMsg({ text: `Test failed: ${(e as Error).message}`, ok: false });
    } finally {
      setIsTesting(false);
    }
  }

  function resetToDefaults() {
    setConfig(mergeEnvDefaults(config, initialConfig, serverDefaults));
    setStatusMsg({ text: "Settings reset to defaults.", ok: true });
  }

  function filteredChats() {
    const q = searchQuery.toLowerCase();
    return Object.keys(chats)
      .sort()
      .reverse()
      .map((id) => {
        const last = (chats[id] || [])
          .slice()
          .reverse()
          .find((m) => m.role === "user");
        const lastTime =
          last?.createdAt ||
          (chats[id] || []).find((m) => m.createdAt)?.createdAt ||
          parseInt(id, 10) ||
          Date.now();
        const dateText = new Date(lastTime).toLocaleDateString();
        const timeText = new Date(lastTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        let labelText = "";
        if (Array.isArray(last?.content)) {
          labelText = last.content
            .map(
              (p) => (p as any).text || ((p as any).image_url ? "[image]" : ""),
            )
            .join(" ")
            .trim();
        } else {
          labelText = (last?.content as string) || "";
        }
        const label = (labelText || `Chat ${id.slice(-4)}`).slice(0, 40);
        if (q && !label.toLowerCase().includes(q)) return null;
        return { id, label, dateText, timeText };
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          label: string;
          dateText: string;
          timeText: string;
        } => !!item,
      );
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const added = await Promise.all(files.map(readAttachment));
    setAttachments((prev) => [...prev, ...(added.filter(Boolean) as any[])]);
    e.target.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const deepOn = !!config.deepSearch;
  const filteredNanoModels = useMemo(() => {
    const q = nanoModelQuery.toLowerCase();
    if (!q) return nanoModels;
    return nanoModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
    );
  }, [nanoModels, nanoModelQuery]);

  const filteredOpenrouterModels = useMemo(() => {
    const q = openrouterModelQuery.toLowerCase();
    if (!q) return openrouterModels;
    return openrouterModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
    );
  }, [openrouterModels, openrouterModelQuery]);

  return (
    <>
      <aside
        className={clsx("sidebar", { open: sidebarOpen })}
        aria-label="Sidebar"
      >
        <div className="sidebar-header">
          <button
            type="button"
            className="icon-btn"
            title="Menu"
            aria-label="Menu"
            onClick={handleSidebarToggle}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </svg>
          </button>
          <div className="brand">SuperKagi</div>
        </div>
        <div className="sidebar-search">
          <div className="search-input">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="text"
              id="chat-search"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className="chip w-full"
            onClick={newChat}
            title="New Chat"
            aria-label="New Chat"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New Chat
          </button>
          <button
            type="button"
            className="chip w-full"
            onClick={() => setShowConfig(true)}
            title="Settings"
            aria-label="Settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1v4" />
              <path d="M12 19v4" />
              <path d="M4.22 4.22l2.83 2.83" />
              <path d="M16.95 16.95l2.83 2.83" />
              <path d="M1 12h4" />
              <path d="M19 12h4" />
              <path d="M4.22 19.78l2.83-2.83" />
              <path d="M16.95 7.05l2.83-2.83" />
            </svg>
            Config
          </button>
          <button
            type="button"
            className="chip w-full"
            onClick={() => {
              if (thread.length > 0) {
                exportChat(currentChatId, thread, "markdown");
              }
            }}
            title="Export current chat"
            aria-label="Export current chat"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </nav>
        <h3 className="section-title">Chats</h3>
        <ul className="chat-list" id="chat-list">
          {filteredChats().map((item) => (
            <li key={item.id} onClick={() => switchChat(item.id)}>
              <div
                className={clsx("chat-item", {
                  active: item.id === currentChatId,
                })}
                title={item.label}
              >
                <div>
                  <span className="chat-title">{item.label}</span>
                  <span className="chat-meta">
                    {item.dateText} • {item.timeText}
                  </span>
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(item.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div
        className={clsx("sidebar-overlay", { show: sidebarOpen })}
        onClick={() => setSidebarOpen(false)}
      />

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open Menu"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </svg>
          </button>
          <div className="top-space" />
        </header>

        <section className="chat-wrap">
          <div className="hero" style={{ display: isEmpty ? "flex" : "none" }}>
            <h1 className="hero-title">SuperKagi</h1>
            <div className="hero-input">
              <div className="pill-input">
                <button
                  type="button"
                  className="icon-btn"
                  title="Attach"
                  aria-label="Attach"
                  onClick={openFilePicker}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.2a2 2 0 01-2.83-2.83l8.49-8.49" />
                  </svg>
                </button>
                <input
                  className="input"
                  id="input"
                  ref={heroInputRef}
                  placeholder="What do you want to know?"
                  value={heroValue}
                  onChange={(e) => setHeroValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage("hero")}
                />
                <div className="input-actions">
                  {config.provider === "nanogpt" && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => generateImage("hero")}
                      disabled={isGeneratingImage}
                      title="Generate Image"
                    >
                      {isGeneratingImage ? "…" : "IMG"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="chip primary"
                    onClick={() => sendMessage("hero")}
                  >
                    Send
                  </button>
                </div>
              </div>
              <AttachmentList
                attachments={attachments}
                removeAttachment={removeAttachment}
              />
            </div>
            <div className="hero-actions">
              <button
                type="button"
                className={clsx("chip", "toggle", { active: deepOn })}
                onClick={toggleDeepSearch}
              >
                DeepSearch
              </button>

              <button
                type="button"
                className="chip"
                onClick={() => setShowConfig(true)}
              >
                Config
              </button>
            </div>
          </div>

          <div
            className="chat-area"
            aria-live="polite"
            aria-relevant="additions"
            style={{ display: isEmpty ? "none" : undefined }}
          >
            {providerError ? (
              <div className="provider-error" role="alert">
                <span>{providerError}</span>
                <button
                  type="button"
                  className="mini-btn ghost"
                  onClick={() => setProviderError(null)}
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {!isEmpty ? (
              <div className="thread-toolbar">
                <div className="thread-search">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search in this chat"
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                  />
                  {messageSearch ? (
                    <button
                      type="button"
                      className="mini-btn ghost"
                      onClick={() => setMessageSearch("")}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="thread-meta">
                  {searchActive
                    ? `${visibleCount}/${totalCount} matches`
                    : `${totalCount} messages`}
                </div>
              </div>
            ) : null}
            {searchActive && !visibleThread.length ? (
              <div className="search-empty">
                No messages match “{messageSearch.trim()}”.
              </div>
            ) : null}
            {visibleThread.map((msg, idx) => {
              const messageId = msg.id || `${currentChatId}-${idx}`;
              const canEdit = msg.role === "user" && !msg.pending;
              const canRegenerate = msg.role === "assistant" && !msg.pending;
              const isEditingMessage = editingMessageId === messageId;
              const isRegenerating = regeneratingId === messageId;
              const isCopying = copiedId === messageId;
              const errorText =
                msg.error ||
                (typeof msg.content === "string" &&
                msg.content.toLowerCase().startsWith("error:")
                  ? msg.content
                  : "");

              return (
                <div key={messageId} className={clsx("message", msg.role)}>
                  <div className="message-row">
                    <div
                      className={clsx("bubble", msg.role, {
                        typing: msg.pending,
                      })}
                    >
                      {msg.pending ? (
                        <output className="typing-dots" aria-live="polite">
                          <span className="dot" />
                          <span className="dot" />
                          <span className="dot" />
                        </output>
                      ) : isEditingMessage ? (
                        <div className="edit-block">
                          <textarea
                            className="field field-textarea"
                            ref={editInputRef}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={Math.max(3, editDraft.split("\n").length)}
                          />
                          <div className="edit-actions">
                            <button
                              type="button"
                              className="chip primary"
                              onClick={saveEditedMessage}
                            >
                              Save &amp; resend
                            </button>
                            <button
                              type="button"
                              className="chip"
                              onClick={cancelEditMessage}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        renderMessageContent(msg)
                      )}
                    </div>
                    <div className="message-actions">
                      <button
                        type="button"
                        className="mini-btn ghost"
                        title="Copy message"
                        onClick={() => copyMessage(msg)}
                      >
                        {isCopying ? "Copied" : "Copy"}
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="mini-btn ghost"
                          title="Edit message"
                          onClick={() => startEditMessage(msg)}
                        >
                          Edit
                        </button>
                      )}
                      {canRegenerate && (
                        <button
                          type="button"
                          className="mini-btn ghost"
                          title="Regenerate response"
                          onClick={() => regenerateAssistant(messageId)}
                          disabled={isRegenerating}
                        >
                          {isRegenerating ? "…" : "Regenerate"}
                        </button>
                      )}
                    </div>
                    <div className="message-meta">
                      {formatMessageTime(msg)}
                      {msg.edited ? " • Edited" : ""}
                    </div>
                  </div>
                  {errorText ? (
                    <div className="message-error">
                      <div className="error-text">{errorText}</div>
                      {canRegenerate ? (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => regenerateAssistant(messageId)}
                          disabled={isRegenerating}
                        >
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <footer
          className="composer"
          style={{ display: isEmpty ? "none" : "grid" }}
        >
          <div className="composer-inner">
            <button
              type="button"
              className="icon-btn"
              title="Attach"
              aria-label="Attach"
              onClick={openFilePicker}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.2a2 2 0 01-2.83-2.83l8.49-8.49" />
              </svg>
            </button>
            <input
              className="input"
              id="composer-input"
              ref={composerInputRef}
              placeholder="Type a message…"
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage("composer")}
            />
            <div className="composer-actions">
              <button
                type="button"
                className={clsx("chip", "toggle", { active: deepOn })}
                onClick={toggleDeepSearch}
              >
                DeepSearch
              </button>

              {config.provider === "nanogpt" && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => generateImage("composer")}
                  disabled={isGeneratingImage}
                  title="Generate Image"
                >
                  {isGeneratingImage ? "…" : "IMG"}
                </button>
              )}
              <button
                type="button"
                className="chip primary"
                onClick={() => sendMessage("composer")}
              >
                Send
              </button>
            </div>
          </div>
          <AttachmentList
            attachments={attachments}
            removeAttachment={removeAttachment}
          />
        </footer>
      </main>

      {showConfig && (
        <div
          className="modal show"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={() => setShowConfig(false)}
        >
          <div
            className="settings-card"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="settings-header">
              <h2 id="settings-title">Settings</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setShowConfig(false)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </header>
            <div className="settings-body">
              <aside className="settings-nav">
                <button
                  type="button"
                  className={clsx("nav-item", {
                    active: settingsTab === "settings",
                  })}
                  onClick={() => setSettingsTab("settings")}
                >
                  <span className="dot" /> Settings
                </button>
                <button
                  type="button"
                  className={clsx("nav-item", {
                    active: settingsTab === "shortcuts",
                  })}
                  onClick={() => setSettingsTab("shortcuts")}
                >
                  <span className="dot" /> Keyboard Shortcuts
                </button>
              </aside>
              <section className="settings-main">
                {settingsTab === "settings" ? (
                  <div className="section">
                    <div className="section-title">Appearance</div>
                    <div className="settings-row">
                      <div className="row-label">Theme</div>
                      <div className="row-content">
                        <div className="segmented">
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: theme === "system",
                            })}
                            onClick={() => setTheme("system")}
                          >
                            System
                          </button>
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: theme === "dark",
                            })}
                            onClick={() => setTheme("dark")}
                          >
                            Dark
                          </button>
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: theme === "light",
                            })}
                            onClick={() => setTheme("light")}
                          >
                            Light
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="section-title">Connections</div>

                    <div className="settings-row">
                      <div className="row-label">Provider</div>
                      <div className="row-content">
                        <div className="segmented" id="provider-seg">
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: config.provider === "local",
                            })}
                            onClick={() => setProvider("local")}
                          >
                            Local
                          </button>
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: config.provider === "openrouter",
                            })}
                            onClick={() => setProvider("openrouter")}
                          >
                            OpenRouter
                          </button>
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: config.provider === "nanogpt",
                            })}
                            onClick={() => setProvider("nanogpt")}
                          >
                            NanoGPT
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="row-label">Model</div>
                      <div
                        className="row-content"
                        style={{
                          flexDirection: "column",
                          alignItems: "stretch",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <input
                            className="field"
                            id="model"
                            value={
                              config.models?.[config.provider] ||
                              config.model ||
                              ""
                            }
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                models: {
                                  ...prev.models,
                                  [prev.provider]: e.target.value,
                                },
                                model: e.target.value,
                              }))
                            }
                            placeholder="e.g., openrouter/auto"
                            autoComplete="off"
                          />
                          {config.provider === "nanogpt" && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={fetchNanoModels}
                              disabled={nanoModelsLoading}
                            >
                              {nanoModelsLoading ? "Fetching…" : "Load models"}
                            </button>
                          )}
                          {config.provider === "openrouter" && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={fetchOpenrouterModels}
                              disabled={openrouterModelsLoading}
                            >
                              {openrouterModelsLoading ? "Fetching…" : "Load models"}
                            </button>
                          )}
                        </div>

                        {config.provider === "nanogpt" && (
                          <div className="nano-models">
                            <div className="nano-status">
                              {nanoModelsStatus ||
                                "Uses your NanoGPT API key to load subscription models."}
                            </div>
                            <div className="nano-model-actions">
                              <input
                                className="field"
                                id="nanogpt-model-search"
                                placeholder="Filter NanoGPT models"
                                value={nanoModelQuery}
                                onChange={(e) =>
                                  setNanoModelQuery(e.target.value)
                                }
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => setNanoModelQuery("")}
                                disabled={!nanoModelQuery}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="nano-model-list">
                              {filteredNanoModels.length ? (
                                filteredNanoModels.map((m) => (
                                  <button
                                    type="button"
                                    key={m.id}
                                    className={clsx("model-pill", {
                                      active:
                                        (config.models?.nanogpt ||
                                          config.model) === m.id,
                                    })}
                                    onClick={() => applyNanoModel(m.id)}
                                    title={m.label}
                                  >
                                    <span className="label">{m.id}</span>
                                    {m.pricing ? (
                                      <span className="meta">{m.pricing}</span>
                                    ) : null}
                                  </button>
                                ))
                              ) : (
                                <div className="nano-status">
                                  No models loaded yet.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {config.provider === "openrouter" && (
                          <div className="nano-models">
                            <div className="nano-status">
                              {openrouterModelsStatus ||
                                "Uses your OpenRouter API key to load available models."}
                            </div>
                            <div className="nano-model-actions">
                              <input
                                className="field"
                                id="openrouter-model-search"
                                placeholder="Filter OpenRouter models"
                                value={openrouterModelQuery}
                                onChange={(e) =>
                                  setOpenrouterModelQuery(e.target.value)
                                }
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => setOpenrouterModelQuery("")}
                                disabled={!openrouterModelQuery}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="nano-model-list">
                              {filteredOpenrouterModels.length ? (
                                filteredOpenrouterModels.map((m) => (
                                  <button
                                    type="button"
                                    key={m.id}
                                    className={clsx("model-pill", {
                                      active:
                                        (config.models?.openrouter ||
                                          config.model) === m.id,
                                    })}
                                    onClick={() => applyOpenrouterModel(m.id)}
                                    title={m.label}
                                  >
                                    <span className="label">{m.id}</span>
                                    {m.pricing ? (
                                      <span className="meta">{m.pricing}</span>
                                    ) : null}
                                  </button>
                                ))
                              ) : (
                                <div className="nano-status">
                                  No models loaded yet.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="settings-row"
                      style={{
                        display:
                          config.provider === "openrouter" ||
                          config.provider === "nanogpt"
                            ? "grid"
                            : "none",
                      }}
                    >
                      <div className="row-label">API Key</div>
                      <div className="row-content">
                        <input
                          className="field"
                          id="api-key"
                          type="password"
                          value={config.apiKey || ""}
                          placeholder={
                            config.provider === "openrouter"
                              ? serverDefaults.hasApiKey && !config.apiKey
                                ? "Using server default"
                                : ""
                              : config.provider === "nanogpt" &&
                                  serverDefaults.hasNanoApiKey &&
                                  !config.apiKey
                                ? "Using server default"
                                : ""
                          }
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              apiKey: e.target.value,
                            }))
                          }
                          autoComplete="off"
                        />
                        <div className="row-helpers">
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => {
                              const el = document.getElementById(
                                "api-key",
                              ) as HTMLInputElement | null;
                              if (!el) return;
                              el.type =
                                el.type === "password" ? "text" : "password";
                            }}
                          >
                            Show
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(config.apiKey || "")
                                .catch(() => undefined)
                            }
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      className="settings-row"
                      style={{
                        display: config.provider === "local" ? "grid" : "none",
                      }}
                    >
                      <div className="row-label">Local URL</div>
                      <div className="row-content">
                        <input
                          className="field"
                          id="local-url"
                          value={config.localUrl}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              localUrl: e.target.value,
                            }))
                          }
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    <div
                      className="settings-row"
                      style={{
                        display:
                          config.provider === "nanogpt" ? "grid" : "none",
                      }}
                    >
                      <div className="row-label">Image Model</div>
                      <div
                        className="row-content"
                        style={{
                          flexDirection: "column",
                          alignItems: "stretch",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <input
                            className="field"
                            id="image-model"
                            value={config.imageModel || ""}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                imageModel: e.target.value,
                              }))
                            }
                            placeholder="e.g., chroma, hidream"
                            autoComplete="off"
                          />
                        </div>
                        <div className="nano-models">
                          <div className="nano-status">
                            Available image models for IMG button:
                          </div>
                          <div className="nano-model-list">
                            {nanoImageModels.map((m) => (
                              <button
                                type="button"
                                key={m.id}
                                className={clsx("model-pill", {
                                  active: config.imageModel === m.id,
                                })}
                                onClick={() =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    imageModel: m.id,
                                  }))
                                }
                                title={`${m.name} - ${m.resolutions.join(", ")}`}
                              >
                                <span className="label">{m.name}</span>
                                <span className="meta">{m.pricing}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className="settings-row"
                      style={{
                        display:
                          config.provider === "nanogpt" ? "grid" : "none",
                      }}
                    >
                      <div className="row-label">
                        <button
                          type="button"
                          className="expand-toggle"
                          onClick={() =>
                            setImageSettingsExpanded(!imageSettingsExpanded)
                          }
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text)",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: 0,
                            width: "100%",
                            textAlign: "left",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: imageSettingsExpanded
                                ? "rotate(90deg)"
                                : "rotate(0deg)",
                              transition: "transform 0.2s ease",
                            }}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                          Image Generation Settings
                        </button>
                      </div>
                      <div className="row-content">
                        <div
                          style={{ fontSize: "12px", color: "var(--muted)" }}
                        >
                          Configure size, steps, and other parameters
                        </div>
                      </div>
                    </div>

                    {imageSettingsExpanded && config.provider === "nanogpt" && (
                      <>
                        <div className="settings-row image-setting">
                          <div className="row-label">Image Size</div>
                          <div className="row-content">
                            <select
                              className="field"
                              value={config.imageSize}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  imageSize: e.target.value,
                                }))
                              }
                            >
                              <option value="256x256">256x256</option>
                              <option value="512x512">512x512</option>
                              <option value="768x1024">
                                768x1024 (Portrait)
                              </option>
                              <option value="576x1024">
                                576x1024 (Portrait 9:16)
                              </option>
                              <option value="1024x768">
                                1024x768 (Landscape)
                              </option>
                              <option value="1024x576">
                                1024x576 (Landscape 16:9)
                              </option>
                              <option value="1024x1024">
                                1024x1024 (Square)
                              </option>
                              <option value="1920x1088">
                                1920x1088 (Landscape HD)
                              </option>
                              <option value="1088x1920">
                                1088x1920 (Portrait HD)
                              </option>
                              <option value="1408x1024">
                                1408x1024 (Landscape Wide)
                              </option>
                              <option value="1024x1408">
                                1024x1408 (Portrait Tall)
                              </option>
                              <option value="2048x2048">
                                2048x2048 (Large Square)
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="settings-row image-setting">
                          <div className="row-label">Steps</div>
                          <div className="row-content">
                            <input
                              type="number"
                              className="field"
                              min="1"
                              max="100"
                              value={config.imageSteps}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  imageSteps:
                                    parseInt(e.target.value, 10) || 30,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="settings-row image-setting">
                          <div className="row-label">Guidance Scale</div>
                          <div className="row-content">
                            <input
                              type="number"
                              className="field"
                              min="0"
                              max="20"
                              step="0.1"
                              value={config.imageGuidanceScale}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  imageGuidanceScale:
                                    parseFloat(e.target.value) || 7.5,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="settings-row image-setting">
                          <div className="row-label">Seed (Optional)</div>
                          <div className="row-content">
                            <input
                              type="number"
                              className="field"
                              min="0"
                              placeholder="Random"
                              value={config.imageSeed || ""}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  imageSeed: e.target.value
                                    ? parseInt(e.target.value, 10)
                                    : undefined,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="settings-row">
                      <div className="row-label">System Prompt</div>
                      <div className="row-content">
                        <textarea
                          className="field field-textarea"
                          id="system-prompt"
                          value={config.systemPrompt}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              systemPrompt: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div
                      id="config-status"
                      className={clsx("config-status", {
                        ok: statusMsg?.ok,
                        err: statusMsg?.ok === false,
                      })}
                    >
                      {statusMsg?.text}
                    </div>

                    <div className="settings-actions">
                      <button
                        type="button"
                        className="chip"
                        onClick={resetToDefaults}
                        title="Reset settings to server defaults"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="chip"
                        onClick={testConnection}
                        disabled={isTesting}
                      >
                        Test Connection
                      </button>
                      <div style={{ flex: 1 }} />
                      <button
                        type="button"
                        className="chip"
                        onClick={() => setShowConfig(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="chip primary"
                        onClick={saveConfigFromModal}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="section">
                    <div className="section-title">Keyboard Shortcuts</div>
                    <div
                      style={{
                        marginBottom: "20px",
                        color: "var(--muted)",
                        fontSize: "14px",
                      }}
                    >
                      Click on a shortcut to record a new key combination.
                    </div>

                    {SHORTCUT_CONFIGS.map((config) => {
                      const currentKey =
                        customShortcuts[config.action] || config.defaultKey;
                      const isEditing = editingShortcut === config.action;
                      const hasConflict =
                        recordingKey &&
                        isEditing &&
                        SHORTCUT_CONFIGS.some(
                          (c) =>
                            c.action !== config.action &&
                            (customShortcuts[c.action] || c.defaultKey) ===
                              recordingKey,
                        );

                      return (
                        <div
                          key={config.action}
                          className="settings-row"
                          style={{ alignItems: "center" }}
                        >
                          <div className="row-label">{config.label}</div>
                          <div className="row-content">
                            {isEditing ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                }}
                              >
                                <input
                                  className="field"
                                  value={
                                    recordingKey
                                      ? formatShortcutDisplay(recordingKey)
                                      : "Press a key combination..."
                                  }
                                  readOnly
                                  style={{
                                    cursor: "pointer",
                                    background: hasConflict
                                      ? "var(--error-bg, #fee)"
                                      : "var(--input-bg)",
                                  }}
                                  onKeyDown={(e) => {
                                    e.preventDefault();
                                    const parsed = parseKeyboardEvent(
                                      e.nativeEvent,
                                    );
                                    if (parsed) {
                                      setRecordingKey(parsed);
                                    }
                                  }}
                                />
                                {hasConflict && (
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--error, #c00)",
                                    }}
                                  >
                                    This shortcut is already in use
                                  </div>
                                )}
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button
                                    type="button"
                                    className="mini-btn"
                                    onClick={() => {
                                      if (
                                        recordingKey &&
                                        isShortcutValid(recordingKey) &&
                                        !hasConflict
                                      ) {
                                        setCustomShortcuts((prev) => ({
                                          ...prev,
                                          [config.action]: recordingKey,
                                        }));
                                        saveCustomShortcuts({
                                          ...customShortcuts,
                                          [config.action]: recordingKey,
                                        });
                                      }
                                      setEditingShortcut(null);
                                      setRecordingKey("");
                                    }}
                                    disabled={!recordingKey || !!hasConflict}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="mini-btn"
                                    onClick={() => {
                                      setEditingShortcut(null);
                                      setRecordingKey("");
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <div
                                  style={{
                                    fontFamily: "monospace",
                                    padding: "8px 12px",
                                    background: "var(--input-bg)",
                                    borderRadius: "6px",
                                    fontSize: "14px",
                                    minWidth: "120px",
                                  }}
                                >
                                  {formatShortcutDisplay(currentKey)}
                                </div>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => {
                                    setEditingShortcut(config.action);
                                    setRecordingKey("");
                                  }}
                                >
                                  Edit
                                </button>
                                {customShortcuts[config.action] && (
                                  <button
                                    type="button"
                                    className="mini-btn"
                                    onClick={() => {
                                      const updated = { ...customShortcuts };
                                      delete updated[config.action];
                                      setCustomShortcuts(updated);
                                      saveCustomShortcuts(updated);
                                    }}
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ marginTop: "20px" }}>
                      <button
                        type="button"
                        className="chip"
                        onClick={() => {
                          setCustomShortcuts({});
                          saveCustomShortcuts({});
                          setEditingShortcut(null);
                          setRecordingKey("");
                        }}
                      >
                        Reset All to Defaults
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        multiple
        accept="image/*,.txt,.md,.csv,.json,.log,.html,.htm,.pdf"
        onChange={onFileInput}
      />
    </>
  );
}

function AttachmentList({
  attachments,
  removeAttachment,
}: {
  attachments: any[];
  removeAttachment: (idx: number) => void;
}) {
  return (
    <div className="attach-list" id="hero-attachments">
      {attachments.map((a, idx) => {
        const ext = a.kind === "image" ? "image" : extOf(a.name) || a.kind;
        return (
          <span key={`${a.name}-${idx}`} className="attach-chip">
            <span className="ext">{ext}</span> {a.name}{" "}
            <button
              type="button"
              title="Remove"
              onClick={() => removeAttachment(idx)}
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

function extOf(name: string) {
  const m = name?.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}

async function readAttachment(file: File) {
  const name = file.name;
  const type = (file.type || "").toLowerCase();
  const ext = extOf(name);
  try {
    if (
      type.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
    ) {
      let url = await readAsDataURL(file);
      url = await optimizeImage(url, 1600, 0.85);
      if (url.length > MAX_UPLOAD_BYTES)
        url = await optimizeImage(url, 1200, 0.8);
      if (url.length > MAX_UPLOAD_BYTES)
        url = await optimizeImage(url, 900, 0.75);
      if (url.length > MAX_UPLOAD_BYTES)
        return {
          kind: "note",
          name,
          text: `[Image too large to attach: ${name}]`,
        };
      return { kind: "image", name, url };
    }
    if (
      ["txt", "md", "csv", "json", "log", "html", "htm"].includes(ext) ||
      type.startsWith("text/")
    ) {
      let text = await readAsText(file);
      text = String(text || "").slice(0, 20000);
      return { kind: "text", name, text };
    }
    if (ext === "pdf" || type === "application/pdf") {
      return { kind: "note", name, text: `[Attached PDF: ${name}]` };
    }
  } catch {}
  return { kind: "note", name, text: `[Attached file: ${name}]` };
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read error"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read error"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

async function optimizeImage(dataUrl: string, maxDim = 1600, quality = 0.85) {
  try {
    const img = document.createElement("img");
    img.decoding = "async";
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", quality);
    return out && out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

function safeParseLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
