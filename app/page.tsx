"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";

// Types
export type Provider = "local" | "openrouter" | "nanogpt";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string | ContentPart[];
  pending?: boolean;
  tool_call_id?: string;
};

export type ChatMap = Record<string, ChatMessage[]>;

export type UiConfig = {
  provider: Provider;
  model: string;
  models: { local: string; openrouter: string; nanogpt: string };
  apiKey?: string;
  localUrl: string;
  systemPrompt: string;
  deepSearch: boolean;
  userSet?: {
    provider?: boolean;
    models?: { local?: boolean; openrouter?: boolean; nanogpt?: boolean };
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
const fallbackDefaults = {
  provider: "local" as Provider,
  modelLocal: defaultModels.local,
  modelOpenrouter: defaultModels.openrouter,
  modelNanogpt: defaultModels.nanogpt,
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
  apiKey: "",
  localUrl: fallbackDefaults.localUrl,
  systemPrompt: fallbackDefaults.systemPrompt,
  deepSearch: fallbackDefaults.deepSearch,
  userSet: { models: {} },
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
  const [nanoModels, setNanoModels] = useState<
    { id: string; label: string; pricing?: string }[]
  >([]);
  const [nanoModelQuery, setNanoModelQuery] = useState("");
  const [nanoModelsStatus, setNanoModelsStatus] = useState("");
  const [nanoModelsLoading, setNanoModelsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const heroInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage and fetch defaults once
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

  // Ensure at least one chat exists and reuse existing empty chats on refresh
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

  // Persist config and chats on change
  useEffect(() => {
    try {
      localStorage.setItem("config", JSON.stringify(config));
    } catch {}
  }, [config]);
  useEffect(() => {
    try {
      localStorage.setItem("chats", JSON.stringify(chats));
    } catch {}
  }, [chats]);

  // Attach drag/drop and paste handlers
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

  // Keep layout-related state on the body element for the grid shell and modal behavior
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

  // Keep sidebar collapse preference on desktop; ensure it's off on mobile widths
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
    if (config.provider !== "nanogpt") return;
    if (!nanoModelsStatus) {
      setNanoModelsStatus(
        "Load subscription-only models using your NanoGPT API key.",
      );
    }
  }, [config.provider, nanoModelsStatus]);

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

  function _focusActiveInput() {
    const useComposer = !isEmpty;
    if (useComposer) composerInputRef.current?.focus();
    else heroInputRef.current?.focus();
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

    setHeroValue("");
    setComposerValue("");

    const userContent = buildUserContentParts(message);
    const chatId = currentChatId || Date.now().toString();
    const userMsg: ChatMessage = { role: "user", content: userContent };
    const pending: ChatMessage = {
      role: "assistant",
      content: "",
      pending: true,
    };

    setChats((prev) => {
      const thread = prev[chatId] ? [...prev[chatId]] : [];
      thread.push(userMsg, pending);
      return { ...prev, [chatId]: thread };
    });
    setAttachments([]);
    setSidebarOpen(false);

    const messagesToSend = threadWithoutPending(chats[chatId], userMsg);
    const activeModel =
      config.models?.[config.provider] ||
      config.model ||
      (config.provider === "openrouter"
        ? defaultModels.openrouter
        : config.provider === "nanogpt"
          ? defaultModels.nanogpt
          : defaultModels.local);
    const payload = {
      messages: messagesToSend,
      provider: config.provider,
      model: activeModel,
      apiKey: config.apiKey,
      localUrl: config.localUrl,
      systemPrompt:
        (config.systemPrompt || "") +
        (config.deepSearch ? deepSearchPrompt : ""),
    };

    await streamAssistantResponse(chatId, payload);
  }

  function threadWithoutPending(
    existing: ChatMessage[] | undefined,
    userMsg: ChatMessage,
  ): ChatMessage[] {
    const filtered = (existing || []).filter((m) => !m.pending);
    return [...filtered, userMsg];
  }

  async function streamAssistantResponse(chatId: string, payload: any) {
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        await fallbackToSingle(chatId, payload);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      let finished = false;

      const update = (finalize = false) => {
        setChats((prev) => {
          const thread = [...(prev[chatId] || [])];
          for (let i = thread.length - 1; i >= 0; i--) {
            const m = thread[i];
            if (m.role === "assistant") {
              thread[i] = {
                role: "assistant",
                content: assembled,
                ...(finalize ? {} : { pending: true }),
              };
              break;
            }
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
            if (typeof data.content === "string") {
              assembled += data.content;
              update(false);
            }
          } catch {}
        }
        if (finished) break;
      }
      update(true);
    } catch (_err) {
      await fallbackToSingle(chatId, payload);
    }
  }

  async function fallbackToSingle(chatId: string, payload: any) {
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { content } = await r.json();
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        for (let i = thread.length - 1; i >= 0; i--) {
          const m = thread[i];
          if (m.role === "assistant") {
            thread[i] = { role: "assistant", content };
            break;
          }
        }
        return { ...prev, [chatId]: thread };
      });
    } catch (e) {
      setChats((prev) => {
        const thread = [...(prev[chatId] || [])];
        for (let i = thread.length - 1; i >= 0; i--) {
          const m = thread[i];
          if (m.role === "assistant") {
            thread[i] = {
              role: "assistant",
              content: `Error: ${(e as Error).message}`,
            };
            break;
          }
        }
        return { ...prev, [chatId]: thread };
      });
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
      const html = msg.content
        .map((part) => {
          if (part.type === "image_url") {
            return `<img src="${part.image_url.url}" alt="image" />`;
          }
          return renderMD(part.text || "");
        })
        .join("");
      // biome-ignore lint/security/noDangerouslySetInnerHtml: rendering markdown content
      return <div dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: rendering markdown content
      <div dangerouslySetInnerHTML={{ __html: renderMD(msg.content || "") }} />
    );
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
        return { id, label };
      })
      .filter(Boolean) as { id: string; label: string }[];
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
                    {new Date(parseInt(item.id, 10)).toLocaleDateString()}
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
          >
            {thread.map((msg, idx) => (
              <div
                key={`${msg.role}-${idx}`}
                className={clsx("message", msg.role)}
              >
                <div
                  className={clsx("bubble", msg.role, { typing: msg.pending })}
                >
                  {msg.pending ? (
                    <span className="typing-dots">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </span>
                  ) : (
                    renderMessageContent(msg)
                  )}
                </div>
              </div>
            ))}
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
                <button type="button" className="nav-item active">
                  <span className="dot" /> Settings
                </button>
              </aside>
              <section className="settings-main">
                <div className="section">
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

function renderMD(text: string) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function renderInline(segment: string) {
    const linkRE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop pattern
    while ((m = linkRE.exec(segment)) !== null) {
      out += esc(segment.slice(last, m.index));
      const t = esc(m[1]);
      const u = esc(m[2]);
      out += `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`;
      last = m.index + m[0].length;
    }
    out += esc(segment.slice(last));
    out = out
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+?)`/g, "<code>$1</code>");
    out = out.replace(/&lt;br\/?&gt;/g, "<br/>");
    return out;
  }

  function renderBlock(blockText: string) {
    const lines = blockText.replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let inList = false;
    const closeList = () => {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    };

    const splitCells = (line: string) => {
      const trimmed = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
      return trimmed.split("|");
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trimEnd();
      if (!line.trim()) {
        closeList();
        continue;
      }
      if (line.startsWith("|")) {
        const next = (lines[i + 1] || "").trim();
        if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next)) {
          const headers = splitCells(line);
          i++;
          closeList();
          html +=
            '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
          headers.forEach((h) => {
            html += `<th>${renderInline(h.trim())}</th>`;
          });
          html += "</tr></thead><tbody>";
          while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
            i++;
            const cells = splitCells(lines[i].trim());
            html += "<tr>";
            for (let c = 0; c < headers.length; c++) {
              html += `<td>${renderInline((cells[c] || "").trim())}</td>`;
            }
            html += "</tr>";
          }
          html += "</tbody></table></div>";
          continue;
        }
      }
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (h) {
        closeList();
        const level = Math.min(6, line.indexOf(" "));
        html += `<h${level}>${renderInline(h[1])}</h${level}>`;
        continue;
      }
      const li = line.match(/^[-*]\s+(.*)$/);
      if (li) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${renderInline(li[1])}</li>`;
        continue;
      }
      closeList();
      html += `<p>${renderInline(line)}</p>`;
    }
    closeList();
    return html;
  }

  let html = "";
  const parts = (text || "").split(/```/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      html += renderBlock(parts[i]);
    } else {
      const seg = parts[i];
      const nl = seg.indexOf("\n");
      const lang = nl === -1 ? "" : seg.slice(0, nl).trim();
      const code = nl === -1 ? seg : seg.slice(nl + 1);
      html += `<pre><code class="lang-${esc(lang)}">${esc(code)}</code></pre>`;
    }
  }
  return html;
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
