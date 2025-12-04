"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "@/components/attachment-list";
import { ChatComposer } from "@/components/chat-composer";
import { ChatHero } from "@/components/chat-hero";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatThread } from "@/components/chat-thread";
import { SettingsModal } from "@/components/settings-modal";
import { exportChat } from "@/lib/export";
import {
  type CustomShortcuts,
  loadCustomShortcuts,
  SHORTCUT_CONFIGS,
  useKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts";
import { useTheme } from "@/lib/theme";
import type {
  ChatMap,
  ChatMessage,
  ContentPart,
  ImageModelOption,
  ModelOption,
  Provider,
  UiConfig,
} from "@/types/chat";

const defaultModels = {
  local: "llama3",
  openrouter: "openrouter/auto",
  nanogpt: "moonshotai/kimi-k2-thinking",
};
const defaultImageModel = "chroma";

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
const defaultImageResolutions = [
  "256x256",
  "512x512",
  "768x1024",
  "576x1024",
  "1024x768",
  "1024x576",
  "1024x1024",
  "1920x1088",
  "1088x1920",
  "1408x1024",
  "1024x1408",
  "2048x2048",
];
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
  apiKeyOpenrouter: "",
  apiKeyNanogpt: "",
  apiKey: "",
  localUrl: fallbackDefaults.localUrl,
  systemPrompt: fallbackDefaults.systemPrompt,
  deepSearch: fallbackDefaults.deepSearch,
  userSet: { models: {} },
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 16000;

function createMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function messageText(
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
  if (!base.apiKeyOpenrouter && (existing as any).apiKey) {
    base.apiKeyOpenrouter = (existing as any).apiKey;
  }
  if (!base.apiKeyNanogpt && (existing as any).apiKey) {
    base.apiKeyNanogpt = (existing as any).apiKey;
  }
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
  const [deepSearchActive, setDeepSearchActive] = useState(false);
  const [nanoModels, setNanoModels] = useState<ModelOption[]>([]);
  const [nanoModelQuery, setNanoModelQuery] = useState("");
  const [nanoModelsStatus, setNanoModelsStatus] = useState("");
  const [nanoModelScope, setNanoModelScope] = useState<"subscription" | "paid">(
    "subscription",
  );
  const [nanoModelsLoading, setNanoModelsLoading] = useState(false);
  const [nanoModelsFetchedAt, setNanoModelsFetchedAt] = useState<number | null>(
    null,
  );
  const [openrouterModels, setOpenrouterModels] = useState<ModelOption[]>([]);
  const [openrouterModelQuery, setOpenrouterModelQuery] = useState("");
  const [openrouterModelsStatus, setOpenrouterModelsStatus] = useState("");
  const [openrouterModelsLoading, setOpenrouterModelsLoading] = useState(false);
  const [openrouterModelsFetchedAt, setOpenrouterModelsFetchedAt] = useState<
    number | null
  >(null);
  const [nanoImageModels, setNanoImageModels] = useState<ImageModelOption[]>(
    [],
  );
  const [nanoImageModelQuery, setNanoImageModelQuery] = useState("");
  const [nanoImageModelsStatus, setNanoImageModelsStatus] = useState("");
  const [nanoImageModelScope, setNanoImageModelScope] = useState<
    "subscription" | "paid"
  >("subscription");
  const [nanoImageModelsLoading, setNanoImageModelsLoading] = useState(false);
  const [nanoImageModelsFetchedAt, setNanoImageModelsFetchedAt] = useState<
    number | null
  >(null);
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
  const [showReasoning, setShowReasoning] = useState(true);
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

    try {
      const storedReasoningPref = localStorage.getItem("showReasoning");
      if (storedReasoningPref != null) {
        setShowReasoning(storedReasoningPref !== "false");
      }
    } catch {}

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
    try {
      localStorage.setItem("showReasoning", String(showReasoning));
    } catch {}
  }, [hydrated, showReasoning]);

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
      const nextAttachments = added.filter((a): a is Attachment => Boolean(a));
      setAttachments((prev) => [...prev, ...nextAttachments]);
    };

    const onPaste = async (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      const activeId = (document.activeElement as HTMLElement | null)?.id || "";
      const isChatInput = activeId === "input" || activeId === "composer-input";

      if (files.length) {
        e.preventDefault();
        const added = await Promise.all(files.map(readAttachment));
        const nextAttachments = added.filter((a): a is Attachment =>
          Boolean(a),
        );
        setAttachments((prev) => [...prev, ...nextAttachments]);
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
        nanoModelScope === "paid"
          ? "Load paid NanoGPT models using your NanoGPT API key."
          : "Load subscription-only models using your NanoGPT API key.",
      );
    }
    if (config.provider === "nanogpt" && !nanoImageModelsStatus) {
      setNanoImageModelsStatus(
        nanoImageModelScope === "paid"
          ? "Load paid NanoGPT image models using your NanoGPT API key."
          : "Load subscription image models using your NanoGPT API key.",
      );
    }
    if (config.provider === "openrouter" && !openrouterModelsStatus) {
      setOpenrouterModelsStatus(
        "Load available models using your OpenRouter API key.",
      );
    }
  }, [
    config.provider,
    nanoModelsStatus,
    nanoModelScope,
    nanoImageModelsStatus,
    nanoImageModelScope,
    openrouterModelsStatus,
  ]);

  useEffect(() => {
    if (config.provider !== "nanogpt") return;
    setNanoModels([]);
    setNanoModelQuery("");
    setNanoModelsStatus(
      nanoModelScope === "paid"
        ? "Load paid NanoGPT models using your NanoGPT API key."
        : "Load subscription-only models using your NanoGPT API key.",
    );
  }, [nanoModelScope, config.provider]);

  useEffect(() => {
    if (config.provider !== "nanogpt") return;
    setNanoImageModels([]);
    setNanoImageModelQuery("");
    setNanoImageModelsStatus(
      nanoImageModelScope === "paid"
        ? "Load paid NanoGPT image models using your NanoGPT API key."
        : "Load subscription image models using your NanoGPT API key.",
    );
  }, [nanoImageModelScope, config.provider]);

  // Load custom shortcuts
  useEffect(() => {
    const loaded = loadCustomShortcuts();
    setCustomShortcuts(loaded);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cached = safeParseLocal<{
      models: ModelOption[];
      fetchedAt: number;
      scope: "subscription" | "paid";
    }>(`nanoModelsCache-${nanoModelScope}`);
    if (cached?.models?.length) {
      setNanoModels(cached.models);
      setNanoModelsFetchedAt(cached.fetchedAt || null);
      setNanoModelsStatus(
        `Loaded ${cached.models.length} models from cache (${new Date(cached.fetchedAt).toLocaleTimeString()}).`,
      );
    }
  }, [hydrated, nanoModelScope]);

  useEffect(() => {
    if (!hydrated) return;
    const cached = safeParseLocal<{
      models: ImageModelOption[];
      fetchedAt: number;
      scope: "subscription" | "paid";
    }>(`nanoImageModelsCache-${nanoImageModelScope}`);
    if (cached?.models?.length) {
      setNanoImageModels(cached.models);
      setNanoImageModelsFetchedAt(cached.fetchedAt || null);
      setNanoImageModelsStatus(
        `Loaded ${cached.models.length} image models from cache (${new Date(cached.fetchedAt).toLocaleTimeString()}).`,
      );
    }
  }, [hydrated, nanoImageModelScope]);

  useEffect(() => {
    if (!hydrated) return;
    const cached = safeParseLocal<{
      models: ModelOption[];
      fetchedAt: number;
    }>("openrouterModelsCache");
    if (cached?.models?.length) {
      setOpenrouterModels(cached.models);
      setOpenrouterModelsFetchedAt(cached.fetchedAt || null);
      setOpenrouterModelsStatus(
        `Loaded ${cached.models.length} models from cache (${new Date(cached.fetchedAt).toLocaleTimeString()}).`,
      );
    }
  }, [hydrated]);

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
      messageText(m, { includeReasoning: showReasoning })
        .toLowerCase()
        .includes(q),
    );
  }, [thread, messageSearch, showReasoning]);

  const searchActive = !!messageSearch.trim();

  function formatMessageTime(msg: ChatMessage) {
    const ts =
      msg.createdAt ||
      (currentChatId ? parseInt(currentChatId, 10) : Date.now());
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatCost(cost?: number | null) {
    if (cost == null || Number.isNaN(cost)) return "";
    if (cost >= 0.01) return `$${cost.toFixed(2)}`;
    if (cost >= 0.001) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(4)}`;
  }

  function estimateImageCost(modelId?: string, size?: string) {
    if (!modelId) return undefined;
    const match = nanoImageModels.find((m) => m.id === modelId);
    if (!match) return undefined;
    const key = (size || "").toLowerCase();
    const map = match.pricePerResolution;
    if (map) {
      const direct = key ? map[key] : undefined;
      if (typeof direct === "number") return direct;
      const compactKey = key.replace(/\s+/g, "");
      const compactVal =
        compactKey && compactKey !== key ? map[compactKey] : undefined;
      if (typeof compactVal === "number") return compactVal;
      if (typeof map.auto === "number") return map.auto;
      const values = Object.values(map).filter(
        (v): v is number => typeof v === "number",
      );
      if (values.length) return Math.min(...values);
    }
    if (typeof match.baseCost === "number") return match.baseCost;
    return undefined;
  }

  const totalCount = thread.length;

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

  function getProviderApiKey(provider: Provider, cfg: UiConfig = config) {
    const providerKey =
      provider === "openrouter"
        ? cfg.apiKeyOpenrouter
        : provider === "nanogpt"
          ? cfg.apiKeyNanogpt
          : "";
    return providerKey || cfg.apiKey || "";
  }

  function buildPayload(messages: ChatMessage[]) {
    const deepSearchEnabled = config.deepSearch;
    const apiKey = getProviderApiKey(config.provider);
    return {
      messages,
      provider: config.provider,
      model: getActiveModel(),
      apiKey,
      apiKeyOpenrouter: config.apiKeyOpenrouter,
      apiKeyNanogpt: config.apiKeyNanogpt,
      localUrl: config.localUrl,
      systemPrompt:
        (config.systemPrompt || "") +
        (deepSearchEnabled ? deepSearchPrompt : ""),
      deepSearch: deepSearchEnabled,
    };
  }

  function buildUserContentParts(text: string) {
    const parts: ContentPart[] = [];
    if (text?.trim()) parts.push({ type: "text", text });
    const provider = config.provider;
    for (const a of attachments) {
      if (a.kind === "image") {
        if ((provider === "openrouter" || provider === "nanogpt") && a.url) {
          const url: string = a.url;
          parts.push({ type: "image_url", image_url: { url } });
        } else {
          parts.push({ type: "text", text: `[Image attached: ${a.name}]` });
        }
      } else if (a.kind === "text") {
        const text = a.text ?? "";
        parts.push({ type: "text", text: `File ${a.name}:\n${text}` });
      } else if (a.kind === "note") {
        const text = a.text ?? "";
        parts.push({ type: "text", text });
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
    if (message.length > MAX_MESSAGE_CHARS) {
      setProviderError(
        `Message is too long. Limit to ${MAX_MESSAGE_CHARS.toLocaleString()} characters.`,
      );
      return;
    }

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
      reasoning: "",
      reasoningDetails: undefined,
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
    const shouldTrackDeep = !!payload?.deepSearch;
    if (shouldTrackDeep) setDeepSearchActive(true);
    const controller = new AbortController();
    const stallAbortMs = config.deepSearch ? 120000 : 45000;
    let lastChunkAt = Date.now();
    let assembled = "";
    let assembledReasoning = "";
    let hasContent = false;
    let latestCost: number | undefined;
    let latestReasoningDetails: unknown;

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
            reasoning: assembledReasoning || undefined,
            reasoningDetails:
              latestReasoningDetails !== undefined
                ? latestReasoningDetails
                : thread[idx].reasoningDetails,
            pending: !finalize,
            error: errorText,
            cost: latestCost ?? thread[idx].cost,
          };
        }
        return { ...prev, [chatId]: thread };
      });
    };

    const watchdog = setInterval(
      () => {
        const elapsed = Date.now() - lastChunkAt;
        if (elapsed > stallAbortMs) {
          controller.abort();
        }
      },
      Math.max(5000, stallAbortMs / 6),
    );
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
      let finished = false;

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
          lastChunkAt = Date.now();
          try {
            const data = JSON.parse(payloadLine);
            if (data?.error) {
              update(true, data.error);
              await fallbackToSingle(chatId, payload, targetAssistantId);
              return;
            }
            if (data?.meta) {
              if (typeof data.meta.cost === "number") {
                latestCost = data.meta.cost;
              }
              continue;
            }
            if (typeof data.reasoning === "string") {
              assembledReasoning += data.reasoning;
              update(false);
            }
            if (data?.reasoning_details !== undefined) {
              latestReasoningDetails = data.reasoning_details;
              update(false);
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
      if (hasContent) {
        update(true, "Stream interrupted; content may be incomplete.");
        return;
      }
      setProviderError(
        controller.signal.aborted
          ? "Streaming stalled — retrying fallback."
          : "Streaming error — retrying fallback.",
      );
      await fallbackToSingle(chatId, payload, targetAssistantId);
    } finally {
      clearInterval(watchdog);
      if (shouldTrackDeep) setDeepSearchActive(false);
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
      const { content, cost, reasoning, reasoning_details } = await r.json();
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
            reasoning:
              typeof reasoning === "string" ? reasoning : thread[idx].reasoning,
            reasoningDetails:
              reasoning_details !== undefined
                ? reasoning_details
                : thread[idx].reasoningDetails,
            pending: false,
            error: undefined,
            cost: typeof cost === "number" ? cost : thread[idx].cost,
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
    const text = messageText(msg, { includeReasoning: showReasoning });
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
    setEditDraft(messageText(msg, { includeReasoning: false }));
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
      reasoning: "",
      reasoningDetails: undefined,
    });

    setChats((prev) => ({ ...prev, [currentChatId]: nextThread }));
    setEditingMessageId(null);
    setEditDraft("");

    const messagesToSend = threadWithoutPending(nextThread);
    const payload = buildPayload(messagesToSend);
    await streamAssistantResponse(currentChatId, payload, pendingId);
  }

  function messageHasImageContent(msg: ChatMessage) {
    return Array.isArray(msg.content)
      ? msg.content.some((part) => part.type === "image_url")
      : false;
  }

  function extractImagePromptFromUserMessage(msg?: ChatMessage | null) {
    if (!msg) return null;
    const text =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter((part) => part.type === "text")
              .map((part) => part.text || "")
              .join("\n")
          : "";
    if (!text) return null;
    const match = text.match(/\[image\]\s*(?:generate|edit):\s*(.+)/i);
    if (match && match[1]) return match[1].trim();
    return null;
  }

  function findPreviousUserMessage(
    thread: ChatMessage[],
    beforeIdx: number,
  ): ChatMessage | null {
    for (let i = beforeIdx - 1; i >= 0; i -= 1) {
      if (thread[i]?.role === "user") return thread[i];
    }
    return null;
  }

  async function regenerateImageMessage(
    chatId: string,
    targetIdx: number,
    targetMsg: ChatMessage,
    originalMessageId: string,
    threadSnapshot: ChatMessage[],
    prompt: string | null,
  ) {
    const pendingId = createMessageId();
    const nextThread = threadSnapshot.slice(0, targetIdx).concat({
      ...targetMsg,
      id: pendingId,
      content: "",
      reasoning: "",
      reasoningDetails: undefined,
      pending: true,
      error: undefined,
    });

    setChats((prev) => ({ ...prev, [chatId]: nextThread }));
    setRegeneratingId(originalMessageId);
    setIsGeneratingImage(true);
    setProviderError(null);

    const normalizedPrompt = prompt?.trim();
    if (!normalizedPrompt) {
      const errorMsg =
        "Unable to regenerate image: original prompt not found.";
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx = thread.findIndex((m) => m.id === pendingId);
        if (idx >= 0) {
          thread[idx] = {
            ...thread[idx],
            content: `Error: ${errorMsg}`,
            pending: false,
            error: errorMsg,
          };
        }
        return { ...prev, [chatId]: thread };
      });
      setIsGeneratingImage(false);
      setRegeneratingId(null);
      return;
    }

    try {
      const res = await fetch("/api/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: normalizedPrompt,
          model: config.imageModel || defaultImageModel,
          size: config.imageSize,
          num_inference_steps: config.imageSteps,
          guidance_scale: config.imageGuidanceScale,
          seed: config.imageSeed,
          apiKey: getProviderApiKey("nanogpt"),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.images?.[0]?.url) {
        const errorMsg =
          data.error || data.details || "Image generation failed";
        setChats((prev) => {
          const thread = [...(prev[chatId] || [])];
          const idx = thread.findIndex((m) => m.id === pendingId);
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
      const cost =
        typeof data.cost === "number"
          ? data.cost
          : estimateImageCost(config.imageModel, config.imageSize);
      if (typeof cost === "number") {
        imageContent.push({
          type: "text",
          text: `Cost: ${formatCost(cost)}`,
        });
      }

      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx = thread.findIndex((m) => m.id === pendingId);
        if (idx >= 0 && thread[idx]?.role === "assistant") {
          thread[idx] = {
            ...thread[idx],
            role: "assistant",
            content: imageContent,
            pending: false,
            error: undefined,
            cost: cost ?? thread[idx].cost,
          };
        }
        return { ...prev, [chatId]: thread };
      });
    } catch (e) {
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        const idx = thread.findIndex((m) => m.id === pendingId);
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
      setRegeneratingId(null);
    }
  }

  async function regenerateAssistant(messageId: string) {
    if (!messageId || !currentChatId) return;
    const thread = chats[currentChatId] || [];
    const targetIdx = thread.findIndex((m) => m.id === messageId);
    if (targetIdx === -1) return;

    const targetMsg = thread[targetIdx];
    const previousUserMsg = findPreviousUserMessage(thread, targetIdx);
    const imagePrompt = extractImagePromptFromUserMessage(previousUserMsg);
    const isImageResponse =
      messageHasImageContent(targetMsg) || Boolean(imagePrompt);
    if (isImageResponse) {
      await regenerateImageMessage(
        currentChatId,
        targetIdx,
        targetMsg,
        messageId,
        thread,
        imagePrompt,
      );
      return;
    }

    const pendingId = createMessageId();
    const nextThread = thread.slice(0, targetIdx).concat({
      ...thread[targetIdx],
      id: pendingId,
      content: "",
      reasoning: "",
      reasoningDetails: undefined,
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
      reasoning: "",
      reasoningDetails: undefined,
    };

    const nextThread = (chats[chatId] ? [...chats[chatId]] : []).concat(
      userMsg,
      pending,
    );

    setChats((prev) => ({ ...prev, [chatId]: nextThread }));
    setSidebarOpen(false);

    const imageAttachment = attachments.find(
      (a) => a.kind === "image" && typeof a.url === "string" && a.url.length,
    );
    const supportsImg2Img = !!activeImageModel?.supportsImg2Img;
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
          apiKey: getProviderApiKey("nanogpt"),
          ...(supportsImg2Img && imageAttachment?.url
            ? { imageDataUrl: imageAttachment.url }
            : {}),
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
      const cost =
        typeof data.cost === "number"
          ? data.cost
          : estimateImageCost(config.imageModel, config.imageSize);
      if (typeof cost === "number") {
        imageContent.push({
          type: "text",
          text: `Cost: ${formatCost(cost)}`,
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
            cost: cost ?? thread[idx].cost,
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
    if (!pricing) {
      const cost = model?.cost ?? model?.costEstimate;
      if (typeof cost === "number") return `$${cost}`;
      if (typeof cost === "string") return cost;
      return "";
    }
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

  function nanoPricingFields(model: any) {
    const pricing =
      (model && (model.pricing || model.prices || model.price)) || null;
    if (!pricing || typeof pricing !== "object") {
      return {
        prompt: undefined,
        completion: undefined,
        unit: undefined,
        currency: undefined,
      };
    }
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
    const unit = pricing.unit || pricing.per || pricing.unit_label;
    const currency = pricing.currency || pricing.curr || pricing.ccy;
    return {
      prompt: typeof prompt === "number" ? prompt : undefined,
      completion: typeof completion === "number" ? completion : undefined,
      unit: typeof unit === "string" ? unit : undefined,
      currency: typeof currency === "string" ? currency : undefined,
    };
  }

  function formatOpenrouterPricing(model: any) {
    const pricing = model?.pricing || null;
    if (!pricing) return "";
    if (typeof pricing === "string") return pricing;
    const prompt = pricing.prompt || pricing.input || pricing["1k_input"];
    const completion =
      pricing.completion || pricing.output || pricing["1k_output"];
    if (prompt && completion) return `${prompt}/${completion}`;
    if (prompt) return `in ${prompt}`;
    if (completion) return `out ${completion}`;
    return "";
  }

  function normalizeNanoModels(list: any[]): ModelOption[] {
    if (!Array.isArray(list)) {
      if (list && typeof list === "object") {
        if ((list as any).text && typeof (list as any).text === "object") {
          list = Object.values((list as any).text);
        } else {
          list = Object.values(list);
        }
      } else {
        return [];
      }
    }
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
        const priceFields = nanoPricingFields(item);
        return {
          id: String(id),
          label,
          pricing,
          pricePrompt: priceFields.prompt,
          priceCompletion: priceFields.completion,
          priceUnit: priceFields.unit,
          priceCurrency: priceFields.currency,
        };
      })
      .filter(Boolean) as ModelOption[];
  }

  function normalizeOpenrouterModels(list: any[]): ModelOption[] {
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
      .filter(Boolean) as ModelOption[];
  }

  function formatNanoImagePricing(model: any) {
    const pricing =
      model?.pricing?.per_image || model?.pricing?.image || model?.cost;
    const currency = model?.pricing?.currency || model?.currency || "USD";
    if (!pricing) return "";
    if (typeof pricing === "number") {
      const symbol = currency === "USD" ? "$" : `${currency} `;
      return `${symbol}${pricing}/img`;
    }
    if (typeof pricing === "string") return pricing;
    const values = Object.values(pricing || {}).filter(
      (v) => typeof v === "number",
    ) as number[];
    if (!values.length) return "";
    const min = Math.min(...values);
    const symbol = currency === "USD" ? "$" : `${currency} `;
    return `${symbol}${min}/img`;
  }

  function extractImageResolutions(model: any) {
    const res: string[] = [];
    const addVal = (v?: unknown) => {
      const val =
        typeof v === "string"
          ? v
          : typeof v === "object" && v && "value" in v
            ? String((v as any).value)
            : null;
      if (val && !res.includes(val)) res.push(val);
    };
    const supported = model?.supported_parameters?.resolutions;
    if (Array.isArray(supported)) supported.forEach(addVal);
    const fromRes = model?.resolutions;
    if (Array.isArray(fromRes)) fromRes.forEach(addVal);
    return res;
  }

  function deriveImageDefaults(model: any) {
    const resolutions = extractImageResolutions(model);
    const firstNonAuto = resolutions.find((r: string) => r !== "auto");
    const defaultSizeRaw =
      model?.defaultSettings?.resolution ||
      model?.defaultSettings?.size ||
      model?.defaultSettings?.resolution_name ||
      model?.default_size;
    const defaultSize =
      typeof defaultSizeRaw === "string"
        ? defaultSizeRaw
        : firstNonAuto || resolutions[0];
    const steps =
      typeof model?.defaultSettings?.steps === "number"
        ? model.defaultSettings.steps
        : typeof model?.defaultSettings?.num_inference_steps === "number"
          ? model.defaultSettings.num_inference_steps
          : typeof model?.additionalParams?.steps?.default === "number"
            ? model.additionalParams.steps.default
            : undefined;
    const guidance =
      typeof model?.defaultSettings?.CFGScale === "number"
        ? model.defaultSettings.CFGScale
        : typeof model?.defaultSettings?.guidance_scale === "number"
          ? model.defaultSettings.guidance_scale
          : typeof model?.additionalParams?.CFGScale?.default === "number"
            ? model.additionalParams.CFGScale.default
            : typeof model?.additionalParams?.guidance_scale?.default ===
                "number"
              ? model.additionalParams.guidance_scale.default
              : undefined;
    return { size: defaultSize, steps, guidance, resolutions };
  }

  function normalizeImageModelTagValue(value: unknown) {
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return normalized || null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value).toLowerCase();
    }
    return null;
  }

  function hasImageModelImg2ImgSupport(model: any) {
    if (!model) return false;
    const flagKeys = [
      "supportsMultipleImg2Img",
      "supportsImg2Img",
      "supports_img2img",
      "supportsImageEdit",
      "supports_image_edit",
      "supports_image_editing",
      "supportsImageToImage",
      "supports_image_to_image",
      "requiresSwapAndTargetImages",
    ];
    for (const key of flagKeys) {
      if (Boolean((model as any)[key])) return true;
    }

    const normalizedList = [
      ...(Array.isArray(model?.tags) ? model.tags : []),
      ...(Array.isArray(model?.capabilities) ? model.capabilities : []),
    ];
    const matchTag = (value: unknown) => {
      const normalized = normalizeImageModelTagValue(value);
      if (!normalized) return false;
      return (
        normalized.includes("img2img") ||
        normalized.includes("image-edit") ||
        normalized.includes("image-to-image")
      );
    };
    if (normalizedList.some(matchTag)) return true;
    const iconLabel = normalizeImageModelTagValue(model?.iconLabel);
    if (iconLabel && matchTag(iconLabel)) return true;
    return false;
  }

  function buildImageModelTags(model: any, supportsImg2Img: boolean) {
    const tags = new Set<string>();
    const addTag = (value: unknown) => {
      const normalized = normalizeImageModelTagValue(value);
      if (normalized) tags.add(normalized);
    };
    if (Array.isArray(model?.tags)) model.tags.forEach(addTag);
    if (Array.isArray(model?.capabilities))
      model.capabilities.forEach(addTag);
    addTag(model?.iconLabel);
    addTag(model?.category);
    addTag(model?.provider);
    addTag(model?.engine);
    if (supportsImg2Img) {
      tags.add("img2img");
      tags.add("image-edit");
    }
    return tags.size ? Array.from(tags) : undefined;
  }

  function extractImagePriceMap(model: any) {
    const pricing =
      model?.pricing?.per_image ||
      model?.pricing?.image ||
      model?.cost ||
      model?.prices;
    if (!pricing || typeof pricing !== "object") return undefined;
    const map: Record<string, number> = {};
    Object.entries(pricing).forEach(([key, val]) => {
      if (typeof val === "number") map[key.toLowerCase()] = val;
    });
    return Object.keys(map).length ? map : undefined;
  }

  function normalizeNanoImageModels(
    list: any[],
    scope: "subscription" | "paid",
  ): ImageModelOption[] {
    if (!Array.isArray(list)) {
      if (list && typeof list === "object") {
        list = Object.values(list);
      } else {
        return [];
      }
    }
    return list
      .map((item) => {
        if (!item) return null;
        const id = item.id || item.model || item.name;
        if (!id) return null;
        const pricing = formatNanoImagePricing(item);
        const defaults = deriveImageDefaults(item);
        const pricePerResolution = extractImagePriceMap(item);
        const minPrice =
          pricePerResolution && Object.values(pricePerResolution).length
            ? Math.min(...Object.values(pricePerResolution))
            : undefined;
        const labelBase = item.name || id;
        const meta = [pricing, defaults.size].filter(Boolean).join(" • ");
        const supportsImg2Img = hasImageModelImg2ImgSupport(item);
        const tags = buildImageModelTags(item, supportsImg2Img);
        return {
          id: String(id),
          label: meta ? `${labelBase} · ${meta}` : String(labelBase),
          name: item.name,
          pricing,
          scope,
          resolutions: defaults.resolutions,
          defaultSize: defaults.size,
          defaultSteps: defaults.steps,
          defaultGuidance: defaults.guidance,
          pricePerResolution,
          currency: item?.pricing?.currency || item?.currency,
          baseCost: minPrice,
          supportsImg2Img,
          tags,
        };
      })
      .filter(Boolean) as ImageModelOption[];
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

  function applyNanoImageModel(id: string) {
    const match = nanoImageModels.find((m) => m.id === id);
    setConfig((prev) => {
      const next: UiConfig = {
        ...prev,
        imageModel: id,
        userSet: {
          ...(prev.userSet || { models: {} }),
          imageModel: true,
          imageSize:
            prev.userSet?.imageSize ||
            (match?.defaultSize ? true : prev.userSet?.imageSize),
          imageSteps:
            prev.userSet?.imageSteps ||
            (match?.defaultSteps ? true : prev.userSet?.imageSteps),
          imageGuidanceScale:
            prev.userSet?.imageGuidanceScale ||
            (match?.defaultGuidance ? true : prev.userSet?.imageGuidanceScale),
        },
      };
      if (match?.defaultSize) next.imageSize = match.defaultSize;
      if (typeof match?.defaultSteps === "number")
        next.imageSteps = match.defaultSteps;
      if (typeof match?.defaultGuidance === "number")
        next.imageGuidanceScale = match.defaultGuidance;
      return next;
    });
    setImageSettingsExpanded(true);
  }

  async function fetchNanoModels() {
    const key = getProviderApiKey("nanogpt");
    if (!key) {
      setNanoModelsStatus("Add a NanoGPT API key first.");
      return;
    }
    setNanoModelsLoading(true);
    const scope = nanoModelScope;
    setNanoModelsStatus(
      scope === "paid"
        ? "Fetching paid NanoGPT models…"
        : "Fetching NanoGPT subscription models…",
    );
    try {
      const payload: Record<string, any> = {
        detailed: true,
        scope,
        apiKey: getProviderApiKey("nanogpt"),
      };
      const res = await fetch("/api/nanogpt/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setNanoModelsFetchedAt(Date.now());
      try {
        localStorage.setItem(
          `nanoModelsCache-${scope}`,
          JSON.stringify({
            models: normalized,
            fetchedAt: Date.now(),
            scope,
          }),
        );
      } catch {}
      setNanoModelsStatus(
        normalized.length
          ? `Loaded ${normalized.length} ${scope === "paid" ? "paid" : "subscription"} models.`
          : scope === "paid"
            ? "No models returned. Check NanoGPT API key."
            : "No models returned. Check subscription/API key.",
      );
    } catch (error) {
      setNanoModels([]);
      setNanoModelsStatus(`Failed: ${(error as Error).message}`);
    } finally {
      setNanoModelsLoading(false);
    }
  }

  async function fetchNanoImageModels() {
    const key = getProviderApiKey("nanogpt");
    if (!key && nanoImageModelScope === "subscription") {
      setNanoImageModelsStatus("Add a NanoGPT API key first.");
      return;
    }
    setNanoImageModelsLoading(true);
    const scope = nanoImageModelScope;
    setNanoImageModelsStatus(
      scope === "paid"
        ? "Fetching paid NanoGPT image models…"
        : "Fetching NanoGPT subscription image models…",
    );
    try {
      const payload: Record<string, any> = {
        detailed: true,
        scope,
        apiKey: getProviderApiKey("nanogpt"),
      };
      const res = await fetch("/api/nanogpt/image-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setNanoImageModels([]);
        setNanoImageModelsStatus(
          data?.error ? String(data.error) : `Request failed (${res.status})`,
        );
        return;
      }
      const normalized = normalizeNanoImageModels(
        data?.models || data?.raw?.data || data?.raw || [],
        scope,
      );
      setNanoImageModels(normalized);
      setNanoImageModelsFetchedAt(Date.now());
      try {
        localStorage.setItem(
          `nanoImageModelsCache-${scope}`,
          JSON.stringify({
            models: normalized,
            fetchedAt: Date.now(),
            scope,
          }),
        );
      } catch {}
      setNanoImageModelsStatus(
        normalized.length
          ? `Loaded ${normalized.length} ${scope === "paid" ? "paid" : "subscription"} image models.`
          : scope === "paid"
            ? "No image models returned. Check NanoGPT API key."
            : "No image models returned. Check subscription/API key.",
      );
    } catch (error) {
      setNanoImageModels([]);
      setNanoImageModelsStatus(`Failed: ${(error as Error).message}`);
    } finally {
      setNanoImageModelsLoading(false);
    }
  }

  async function fetchOpenrouterModels() {
    const key = getProviderApiKey("openrouter");
    if (!key) {
      setOpenrouterModelsStatus("Add an OpenRouter API key first.");
      return;
    }
    setOpenrouterModelsLoading(true);
    setOpenrouterModelsStatus("Fetching OpenRouter models…");
    try {
      const res = await fetch("/api/openrouter/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
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
      setOpenrouterModelsFetchedAt(Date.now());
      try {
        localStorage.setItem(
          "openrouterModelsCache",
          JSON.stringify({ models: normalized, fetchedAt: Date.now() }),
        );
      } catch {}
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
          apiKey:
            !!prev.apiKeyOpenrouter || !!prev.apiKeyNanogpt || !!prev.apiKey,
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
        apiKey: getProviderApiKey(config.provider),
        apiKeyOpenrouter: config.apiKeyOpenrouter,
        apiKeyNanogpt: config.apiKeyNanogpt,
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
        const totalCost = (chats[id] || []).reduce(
          (sum, msg) => sum + (msg.cost || 0),
          0,
        );
        const costText = totalCost > 0 ? formatCost(totalCost) : "";
        return { id, label, dateText, timeText, costText, totalCost };
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          label: string;
          dateText: string;
          timeText: string;
          costText: string;
          totalCost: number;
        } => !!item,
      );
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const added = await Promise.all(files.map(readAttachment));
    const nextAttachments = added.filter((a): a is Attachment => Boolean(a));
    setAttachments((prev) => [...prev, ...nextAttachments]);
    e.target.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const deepOn = !!config.deepSearch;
  const providerApiKey = getProviderApiKey(config.provider);
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

  const filteredNanoImageModels = useMemo(() => {
    const q = nanoImageModelQuery.toLowerCase();
    if (!q) return nanoImageModels;
    return nanoImageModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.label && m.label.toLowerCase().includes(q)) ||
        (m.tags?.some((tag) => tag.includes(q)) ?? false),
    );
  }, [nanoImageModels, nanoImageModelQuery]);

  const activeImageModel = useMemo(
    () => nanoImageModels.find((m) => m.id === (config.imageModel || "")),
    [nanoImageModels, config.imageModel],
  );

  useEffect(() => {
    if (!nanoImageModels.length) return;
    const match = nanoImageModels.find((m) => m.id === config.imageModel);
    if (!match) return;
    setConfig((prev) => {
      const userSet = prev.userSet || { models: {} };
      let changed = false;
      const next: UiConfig = { ...prev };
      if (!userSet.imageSize && match.defaultSize) {
        next.imageSize = match.defaultSize;
        changed = true;
      }
      if (!userSet.imageSteps && typeof match.defaultSteps === "number") {
        next.imageSteps = match.defaultSteps;
        changed = true;
      }
      if (
        !userSet.imageGuidanceScale &&
        typeof match.defaultGuidance === "number"
      ) {
        next.imageGuidanceScale = match.defaultGuidance;
        changed = true;
      }
      if (!changed) return prev;
      next.userSet = {
        ...userSet,
        imageSize: userSet.imageSize || !!match.defaultSize,
        imageSteps:
          userSet.imageSteps || typeof match.defaultSteps === "number",
        imageGuidanceScale:
          userSet.imageGuidanceScale ||
          typeof match.defaultGuidance === "number",
      };
      return next;
    });
  }, [nanoImageModels, config.imageModel]);

  const imageResolutionOptions = useMemo(() => {
    const base =
      activeImageModel?.resolutions && activeImageModel.resolutions.length
        ? activeImageModel.resolutions
        : defaultImageResolutions;
    const unique = new Set<string>();
    base.forEach((r) => {
      if (typeof r === "string" && r.trim()) unique.add(r);
    });
    if (config.imageSize) unique.add(config.imageSize);
    return Array.from(unique);
  }, [activeImageModel?.resolutions, config.imageSize]);

  return (
    <>
      <ChatSidebar
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
        onCloseOverlay={() => setSidebarOpen(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onNewChat={newChat}
        onOpenConfig={() => setShowConfig(true)}
        onExport={() => {
          if (thread.length > 0) {
            exportChat(currentChatId, thread, "markdown");
          }
        }}
        chats={filteredChats()}
        currentChatId={currentChatId}
        onDeleteChat={deleteChat}
        onSwitchChat={switchChat}
        extraNav={
          <a
            className="chip w-full"
            href="/pricing"
            title="Pricing dashboard"
            aria-label="Pricing dashboard"
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
              <path d="M3 3h18v18H3z" />
              <path d="M7 13h3v6H7z" />
              <path d="M14 5h3v14h-3z" />
            </svg>
            Pricing
          </a>
        }
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
          <ChatHero
            isEmpty={isEmpty}
            heroValue={heroValue}
            onChange={setHeroValue}
            onSend={() => sendMessage("hero")}
            openFilePicker={openFilePicker}
            toggleDeepSearch={toggleDeepSearch}
            deepOn={deepOn}
            configProvider={config.provider}
            isGeneratingImage={isGeneratingImage}
            onGenerateImage={() => generateImage("hero")}
            attachments={attachments}
            removeAttachment={removeAttachment}
            inputRef={heroInputRef}
            onOpenConfig={() => setShowConfig(true)}
          />

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
            {deepSearchActive ? (
              <output className="provider-error info">
                <span>DeepSearch is running tools for this message…</span>
                <span className="badge">MCP</span>
              </output>
            ) : null}
            <ChatThread
              thread={thread}
              visibleThread={visibleThread}
              searchActive={searchActive}
              totalCount={totalCount}
              visibleCount={visibleThread.length}
              editingMessageId={editingMessageId}
              editDraft={editDraft}
              editInputRef={editInputRef}
              regeneratingId={regeneratingId}
              copiedId={copiedId}
              messageSearch={messageSearch}
              setMessageSearch={setMessageSearch}
              onCopyMessage={copyMessage}
              onStartEdit={(msg) => startEditMessage(msg)}
              onCancelEdit={cancelEditMessage}
              onSaveEdit={saveEditedMessage}
              onEditDraftChange={setEditDraft}
              onRegenerate={regenerateAssistant}
              onRetry={regenerateAssistant}
              formatMessageTime={formatMessageTime}
              formatCost={formatCost}
              showReasoning={showReasoning}
              onToggleReasoning={() => setShowReasoning((v) => !v)}
            />
          </div>
        </section>

        <ChatComposer
          visible={!isEmpty}
          composerValue={composerValue}
          onChange={setComposerValue}
          onSend={() => sendMessage("composer")}
          openFilePicker={openFilePicker}
          toggleDeepSearch={toggleDeepSearch}
          deepOn={deepOn}
          configProvider={config.provider}
          isGeneratingImage={isGeneratingImage}
          onGenerateImage={() => generateImage("composer")}
          attachments={attachments}
          removeAttachment={removeAttachment}
          inputRef={composerInputRef}
        />
      </main>

      <SettingsModal
        show={showConfig}
        onClose={() => setShowConfig(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        theme={theme}
        setTheme={setTheme}
        config={config}
        setConfig={setConfig}
        serverDefaults={serverDefaults}
        statusMsg={statusMsg}
        isTesting={isTesting}
        onTest={testConnection}
        onReset={resetToDefaults}
        onSave={saveConfigFromModal}
        providerApiKey={providerApiKey}
        setProvider={setProvider}
        nanoModelScope={nanoModelScope}
        setNanoModelScope={setNanoModelScope}
        nanoModelQuery={nanoModelQuery}
        setNanoModelQuery={setNanoModelQuery}
        nanoModelsStatus={nanoModelsStatus}
        nanoModelsLoading={nanoModelsLoading}
        nanoModelsFetchedAt={nanoModelsFetchedAt}
        filteredNanoModels={filteredNanoModels}
        applyNanoModel={applyNanoModel}
        fetchNanoModels={fetchNanoModels}
        openrouterModelQuery={openrouterModelQuery}
        setOpenrouterModelQuery={setOpenrouterModelQuery}
        openrouterModelsStatus={openrouterModelsStatus}
        openrouterModelsLoading={openrouterModelsLoading}
        openrouterModelsFetchedAt={openrouterModelsFetchedAt}
        filteredOpenrouterModels={filteredOpenrouterModels}
        applyOpenrouterModel={applyOpenrouterModel}
        fetchOpenrouterModels={fetchOpenrouterModels}
        imageSettingsExpanded={imageSettingsExpanded}
        setImageSettingsExpanded={setImageSettingsExpanded}
        nanoImageModelScope={nanoImageModelScope}
        setNanoImageModelScope={setNanoImageModelScope}
        nanoImageModelQuery={nanoImageModelQuery}
        setNanoImageModelQuery={setNanoImageModelQuery}
        nanoImageModelsStatus={nanoImageModelsStatus}
        nanoImageModelsLoading={nanoImageModelsLoading}
        nanoImageModelsFetchedAt={nanoImageModelsFetchedAt}
        filteredNanoImageModels={filteredNanoImageModels}
        applyNanoImageModel={applyNanoImageModel}
        fetchNanoImageModels={fetchNanoImageModels}
        imageResolutionOptions={imageResolutionOptions}
        activeImageModel={activeImageModel}
        nanoImageModels={nanoImageModels}
        customShortcuts={customShortcuts}
        setCustomShortcuts={setCustomShortcuts}
        editingShortcut={editingShortcut}
        setEditingShortcut={setEditingShortcut}
        recordingKey={recordingKey}
        setRecordingKey={setRecordingKey}
      />

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

async function readAttachment(file: File): Promise<Attachment | null> {
  const name = file.name;
  const type = (file.type || "").toLowerCase();
  const ext = name?.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "";
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
