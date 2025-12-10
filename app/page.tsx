"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "@/components/attachment-list";
import { ChatComposer } from "@/components/chat-composer";
import { ChatHero } from "@/components/chat-hero";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ChatThread } from "@/components/chat-thread";
import { SettingsModal } from "@/components/settings-modal";
import {
  chatsArrayToMap,
  createMessageId,
  messageText,
  threadToStored,
} from "@/lib/chat-utils";
import {
  deepSearchPrompt,
  defaultImageModel,
  defaultModels,
  mergeEnvDefaults,
} from "@/lib/config-utils";
import { exportChat } from "@/lib/export";
import { readAttachment } from "@/lib/file-utils";
import {
  loadCustomShortcuts,
  SHORTCUT_CONFIGS,
  useKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts";
import { estimateImageCost } from "@/lib/model-utils";
import { useAuthStore } from "@/lib/store/auth-store";
import { useChatStore } from "@/lib/store/chat-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useModelStore } from "@/lib/store/model-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useTheme } from "@/lib/theme";
import type {
  ChatMap,
  ChatMessage,
  ContentPart,
  Provider,
  UiConfig,
} from "@/types/chat";

const _MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 16000;

// Utils moved to lib/chat-utils.ts and lib/config-utils.ts

function _formatCost(cost?: number | null) {
  if (cost == null || Number.isNaN(cost)) return "";
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  if (cost >= 0.001) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}

export default function Page() {
  const router = useRouter();
  const { user, loading: authLoading, initialized: authInitialized, checkSession } = useAuthStore();

  // Check authentication on mount
  useEffect(() => {
    if (!authInitialized) {
      checkSession();
    }
  }, [authInitialized, checkSession]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authInitialized && !authLoading && !user) {
      router.replace("/login");
    }
  }, [authInitialized, authLoading, user, router]);

  const {
    config,
    setConfig,
    serverDefaults,
    setServerDefaults,
    hydrated,
    setHydrated,
    persistLoaded,
    setPersistLoaded,
    providerError,
    setProviderError,
  } = useConfigStore();

  const {
    chats,
    setChats,
    currentChatId,
    setCurrentChatId,
    attachments,
    setAttachments,
    // searchQuery,
    // setSearchQuery,
    messageSearch,
    setMessageSearch,
    regeneratingId,
    setRegeneratingId,
    copiedId,
    setCopiedId,
  } = useChatStore();

  const {
    showConfig,
    setShowConfig,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    heroValue,
    setHeroValue,
    composerValue,
    setComposerValue,
    // statusMsg,       // Unused in page
    // setStatusMsg,    // Unused in page
    customShortcuts,
    setCustomShortcuts,
    editingMessageId,
    setEditingMessageId,
    editDraft,
    setEditDraft,
    // imageSettingsExpanded,
    // setImageSettingsExpanded,
    showReasoning,
    setShowReasoning,
  } = useUIStore();

  // Local state for things that don't need to be in global store or are derived

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [deepSearchActive, setDeepSearchActive] = useState(false);

  // Refs
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const swRegisteredRef = useRef(false);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to get API keys
  function getProviderApiKey(provider: Provider, cfg: UiConfig = config) {
    const providerKey =
      provider === "openrouter"
        ? cfg.apiKeyOpenrouter
        : provider === "nanogpt"
          ? cfg.apiKeyNanogpt
          : "";
    return providerKey || cfg.apiKey || "";
  }

  useEffect(() => {
    fetch("/api/config-defaults")
      .then((r) => r.json())
      .then((data) => {
        setServerDefaults(data);
        setConfig((prev) => mergeEnvDefaults(prev, prev, data));

        // Auto-load NanoGPT models if provider is nanogpt and we have API access
        if (data.provider === "nanogpt" && data.hasNanoApiKey) {
          const { fetchNanoModels, nanoModels, nanoModelsLoading } = useModelStore.getState();
          if (nanoModels.length === 0 && !nanoModelsLoading) {
            fetchNanoModels();
          }
        }
      })
      .catch(() => undefined);

    setHydrated(true);
  }, [setConfig, setServerDefaults, setHydrated]);

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
      } catch { }

      try {
        const chatRes = await fetch("/api/persistence/chats", {
          cache: "no-store",
        });
        if (chatRes.ok) {
          const data = await chatRes.json();
          if (Array.isArray(data?.chats)) {
            const mapped = chatsArrayToMap(data.chats);
            // Replace localStorage chats with server chats (user-specific data)
            setChats(mapped);
            const firstId =
              Object.keys(mapped)[0] || "";
            if (firstId) setCurrentChatId(firstId);
          }
        }
      } catch { }
      setPersistLoaded(true);
    })();
  }, [
    hydrated,
    serverDefaults,
    setConfig,
    setChats,
    setCurrentChatId,
    setPersistLoaded,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("showReasoning", String(showReasoning));
    } catch { }
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
  }, [hydrated, setChats]);

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
      } catch { }
      if (!chats[nextId]) setChats((prev) => ({ ...prev, [nextId]: [] }));
      return;
    }

    const id = Date.now().toString();
    setCurrentChatId(id);
    setChats((prev) => ({ ...prev, [id]: [] }));
    try {
      localStorage.setItem("currentChatId", id);
    } catch { }
  }, [currentChatId, chats, hydrated, setCurrentChatId, setChats]);

  useEffect(() => {
    try {
      localStorage.setItem("config", JSON.stringify(config));
    } catch { }
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
    } catch { }
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
  }, [setAttachments]);

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
  }, [sidebarCollapsed, setSidebarCollapsed]);

  // Load custom shortcuts
  useEffect(() => {
    const loaded = loadCustomShortcuts();
    setCustomShortcuts(loaded);
  }, [setCustomShortcuts]);

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
      setSidebarOpen(!sidebarOpen);
      return;
    }
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", String(next));
      } catch { }
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
          } catch { }
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
    if (match?.[1]) return match[1].trim();
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
      const errorMsg = "Unable to regenerate image: original prompt not found.";
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
          : estimateImageCost(
            useModelStore.getState().nanoImageModels,
            config.imageModel,
            config.imageSize,
          );
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
    const activeImageModel = useModelStore
      .getState()
      .nanoImageModels.find((m) => m.id === config.imageModel);
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
          : estimateImageCost(
            useModelStore.getState().nanoImageModels,
            config.imageModel,
            config.imageSize,
          );
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

  return (
    <>
      <ChatSidebar
        onExport={() => {
          if (thread.length > 0) {
            exportChat(currentChatId, thread, "markdown");
          }
        }}
        extraNav={
          <a
            className="nav-item-icon"
            href="/pricing"
            title="Pricing dashboard"
            aria-label="Pricing dashboard"
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
              <path d="M3 3h18v18H3z" />
              <path d="M7 13h3v6H7z" />
              <path d="M14 5h3v14h-3z" />
            </svg>
            <span>Pricing</span>
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
            currentModel={getActiveModel()}
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
              onToggleReasoning={() => setShowReasoning(!showReasoning)}
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
          currentModel={getActiveModel()}
          onOpenConfig={() => setShowConfig(true)}
        />
      </main>

      <SettingsModal />

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

// File utils moved to lib/file-utils.ts
