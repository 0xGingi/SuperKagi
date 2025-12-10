"use client";

import clsx from "clsx";
import { useState } from "react";
import { ShortcutsPanel } from "@/components/shortcuts-panel";
import { defaultImageResolutions, initialConfig } from "@/lib/config-utils";
import { useConfigStore } from "@/lib/store/config-store";
import { useModelStore } from "@/lib/store/model-store";
import { useUIStore } from "@/lib/store/ui-store";
import { useTheme } from "@/lib/theme";
import type { ChatMessage, UiConfig } from "@/types/chat";

export function SettingsModal() {
  const {
    showConfig,
    setShowConfig,
    settingsTab,
    setSettingsTab,
    statusMsg,
    setStatusMsg,
    customShortcuts,
    setCustomShortcuts,
    editingShortcut,
    setEditingShortcut,
    recordingKey,
    setRecordingKey,
  } = useUIStore();

  const { config, setConfig, serverDefaults } = useConfigStore();

  const {
    nanoModels,
    nanoModelsStatus,
    nanoModelScope,
    setNanoModelScope,
    nanoModelsLoading,
    nanoModelsFetchedAt,
    fetchNanoModels,
    // setNanoModels, // If needed for clear

    openrouterModels,
    openrouterModelsStatus,
    openrouterModelsLoading,
    openrouterModelsFetchedAt,
    fetchOpenrouterModels,

    nanoImageModels,
    nanoImageModelsStatus,
    nanoImageModelScope,
    nanoImageModelsLoading,
    nanoImageModelsFetchedAt,
    setNanoImageModelScope,
    fetchNanoImageModels,
  } = useModelStore();

  const { theme, setTheme } = useTheme();

  // Local state for queries handling (could be in UI store but local is fine for ephemeral search in modal)
  const [nanoModelQuery, setNanoModelQuery] = useState("");
  const [openrouterModelQuery, setOpenrouterModelQuery] = useState("");
  const [nanoImageModelQuery, setNanoImageModelQuery] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  // Derived state
  const providerApiKey =
    config.provider === "openrouter"
      ? config.apiKeyOpenrouter
      : config.provider === "nanogpt"
        ? config.apiKeyNanogpt
        : "";

  const filteredNanoModels = nanoModels.filter((m) =>
    (m.id + (m.label || ""))
      .toLowerCase()
      .includes(nanoModelQuery.toLowerCase()),
  );

  const filteredOpenrouterModels = openrouterModels.filter((m) =>
    (m.id + (m.label || ""))
      .toLowerCase()
      .includes(openrouterModelQuery.toLowerCase()),
  );

  const filteredNanoImageModels = nanoImageModels.filter((m) =>
    (m.id + (m.label || ""))
      .toLowerCase()
      .includes(nanoImageModelQuery.toLowerCase()),
  );

  const activeImageModel = nanoImageModels.find(
    (m) => m.id === (config.imageModel || ""),
  );

  const _imageResolutionOptions = activeImageModel?.resolutions?.length
    ? activeImageModel.resolutions
    : defaultImageResolutions;

  const applyNanoModel = (id: string) => {
    setConfig((prev: UiConfig) => ({
      ...prev,
      models: { ...prev.models, nanogpt: id },
      model: id,
    }));
  };

  const applyOpenrouterModel = (id: string) => {
    setConfig((prev: UiConfig) => ({
      ...prev,
      models: { ...prev.models, openrouter: id },
      model: id,
    }));
  };

  const applyNanoImageModel = (id: string) => {
    setConfig((prev: UiConfig) => ({ ...prev, imageModel: id }));
  };

  const setProvider = (val: UiConfig["provider"]) => {
    setConfig((prev: UiConfig) => ({ ...prev, provider: val }));
  };

  async function testConnection() {
    setIsTesting(true);
    setStatusMsg(null);
    try {
      const msgs: ChatMessage[] = [
        { role: "user", content: "Hello, are you working?" },
      ];
      const payload = {
        messages: msgs,
        config,
        provider: config.provider,
        stream: false,
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || res.statusText);
      }
      setStatusMsg({ text: "Connection successful!", ok: true });
    } catch (e: any) {
      setStatusMsg({ text: `Connection failed: ${e.message}`, ok: false });
    } finally {
      setIsTesting(false);
    }
  }

  function resetToDefaults() {
    if (!confirm("Are you sure you want to reset all settings?")) return;
    setConfig((_prev: UiConfig) => ({
      ...initialConfig,
      // Preserve API keys maybe? page.tsx didn't.
      // It preserved nothing.
    }));
    setStatusMsg({ text: "Settings reset to defaults.", ok: true });
  }

  if (!showConfig) return null;

  return (
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
            {/* General Settings */}
            <button
              type="button"
              className={clsx("nav-item-icon", {
                active: settingsTab === "settings",
              })}
              onClick={() => setSettingsTab("settings")}
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>General</span>
            </button>

            {/* Connection */}
            <button
              type="button"
              className={clsx("nav-item-icon", {
                active: settingsTab === "connection",
              })}
              onClick={() => setSettingsTab("connection")}
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
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Connection</span>
            </button>

            {/* Text Models */}
            <button
              type="button"
              className={clsx("nav-item-icon", {
                active: settingsTab === "textModels",
              })}
              onClick={() => setSettingsTab("textModels")}
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Text Models</span>
            </button>

            {/* Image Models */}
            <button
              type="button"
              className={clsx("nav-item-icon", {
                active: settingsTab === "imageModels",
              })}
              onClick={() => setSettingsTab("imageModels")}
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
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21,15 16,10 5,21" />
              </svg>
              <span>Image Models</span>
            </button>

            {/* Keyboard Shortcuts */}
            <button
              type="button"
              className={clsx("nav-item-icon", {
                active: settingsTab === "shortcuts",
              })}
              onClick={() => setSettingsTab("shortcuts")}
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
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M8 16h8" />
              </svg>
              <span>Shortcuts</span>
            </button>
          </aside>
          <section className="settings-main">
            {settingsTab === "settings" && (
              <div className="section">
                <div className="section-title">Appearance</div>
                <div className="settings-row">
                  <div className="row-label">Theme</div>
                  <div className="row-content">
                    <div className="segmented">
                      <button
                        type="button"
                        className={clsx("seg", { active: theme === "system" })}
                        onClick={() => setTheme("system")}
                      >
                        System
                      </button>
                      <button
                        type="button"
                        className={clsx("seg", { active: theme === "dark" })}
                        onClick={() => setTheme("dark")}
                      >
                        Dark
                      </button>
                      <button
                        type="button"
                        className={clsx("seg", { active: theme === "light" })}
                        onClick={() => setTheme("light")}
                      >
                        Light
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-actions">
                  {statusMsg && (
                    <div
                      className={clsx("status-msg", { error: !statusMsg.ok })}
                    >
                      {statusMsg.text}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={testConnection}
                    disabled={isTesting}
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn danger"
                    onClick={resetToDefaults}
                  >
                    Reset Defaults
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setShowConfig(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Connection Tab */}
            {settingsTab === "connection" && (
              <div className="section">
                <div className="section-title">Provider</div>
                <p className="section-desc">
                  Select your AI provider and configure API credentials.
                </p>

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

                {config.provider === "local" && (
                  <div className="settings-row">
                    <div className="row-label">Local URL</div>
                    <div className="row-content">
                      <input
                        className="field"
                        value={config.localUrl}
                        onChange={(e) =>
                          setConfig((prev: UiConfig) => ({
                            ...prev,
                            localUrl: e.target.value,
                          }))
                        }
                        placeholder="http://localhost:11434/v1"
                      />
                    </div>
                  </div>
                )}

                {(config.provider === "openrouter" ||
                  config.provider === "nanogpt") && (
                  <div className="settings-row">
                    <div className="row-label">API Key</div>
                    <div className="row-content">
                      <input
                        className="field"
                        type="password"
                        id="api-key-connection"
                        value={providerApiKey || ""}
                        onChange={(e) =>
                          setConfig((prev: UiConfig) => {
                            const val = e.target.value;
                            if (prev.provider === "openrouter")
                              return { ...prev, apiKeyOpenrouter: val };
                            if (prev.provider === "nanogpt")
                              return { ...prev, apiKeyNanogpt: val };
                            return prev;
                          })
                        }
                        placeholder={
                          config.provider === "openrouter"
                            ? serverDefaults.hasApiKey && !providerApiKey
                              ? "Using server default"
                              : ""
                            : config.provider === "nanogpt" &&
                                serverDefaults.hasNanoApiKey &&
                                !providerApiKey
                              ? "Using server default"
                              : ""
                        }
                      />
                      <div className="row-helpers">
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            const el = document.getElementById(
                              "api-key-connection",
                            ) as HTMLInputElement;
                            if (el)
                              el.type =
                                el.type === "password" ? "text" : "password";
                          }}
                        >
                          Show
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="settings-actions">
                  {statusMsg && (
                    <div
                      className={clsx("status-msg", { error: !statusMsg.ok })}
                    >
                      {statusMsg.text}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={testConnection}
                    disabled={isTesting}
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setShowConfig(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {settingsTab === "textModels" && (
              <div className="section">
                <div className="section-title">Text Models</div>
                <p className="section-desc">
                  Select and configure text generation models for your current
                  provider ({config.provider}).
                </p>

                <div className="settings-row">
                  <div className="row-label">Model</div>
                  <div
                    className="row-content"
                    style={{ flexDirection: "column", gap: 10 }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <input
                        className="field"
                        value={
                          config.models?.[config.provider] || config.model || ""
                        }
                        onChange={(e) =>
                          setConfig((prev: UiConfig) => ({
                            ...prev,
                            model: e.target.value,
                            models: {
                              ...(prev.models || {}),
                              [prev.provider]: e.target.value,
                            },
                            userSet: {
                              ...(prev.userSet || { models: {} }),
                              models: {
                                ...(prev.userSet?.models || {}),
                                [prev.provider]: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="Enter model name or select below"
                      />
                      {config.provider === "nanogpt" && (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={fetchNanoModels}
                          disabled={nanoModelsLoading}
                        >
                          {nanoModelsLoading ? "Loading..." : "Load Models"}
                        </button>
                      )}
                      {config.provider === "openrouter" && (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={fetchOpenrouterModels}
                          disabled={openrouterModelsLoading}
                        >
                          {openrouterModelsLoading
                            ? "Loading..."
                            : "Load Models"}
                        </button>
                      )}
                    </div>

                    {/* NanoGPT Model List */}
                    {config.provider === "nanogpt" && (
                      <div className="nano-models">
                        <div className="nano-status">
                          <div>
                            {nanoModelsStatus ||
                              "Load models using your NanoGPT API key."}
                          </div>
                          {nanoModelsFetchedAt && (
                            <div className="nano-meta">
                              Last fetched:{" "}
                              {new Date(
                                nanoModelsFetchedAt,
                              ).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                        <div className="nano-model-actions">
                          <div className="segmented nano-scope-toggle">
                            <button
                              type="button"
                              className={clsx("seg", {
                                active: nanoModelScope === "subscription",
                              })}
                              onClick={() => setNanoModelScope("subscription")}
                            >
                              Subscription
                            </button>
                            <button
                              type="button"
                              className={clsx("seg", {
                                active: nanoModelScope === "paid",
                              })}
                              onClick={() => setNanoModelScope("paid")}
                            >
                              Paid
                            </button>
                          </div>
                          <input
                            className="field"
                            placeholder="Filter models..."
                            value={nanoModelQuery}
                            onChange={(e) => setNanoModelQuery(e.target.value)}
                          />
                          {nanoModelQuery && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={() => setNanoModelQuery("")}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="nano-model-list">
                          {filteredNanoModels.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className={clsx("model-pill", {
                                active:
                                  (config.models?.nanogpt || config.model) ===
                                  m.id,
                              })}
                              onClick={() => applyNanoModel(m.id)}
                              title={m.label}
                            >
                              <span className="label">{m.id}</span>
                              {m.pricing && (
                                <span className="meta">{m.pricing}</span>
                              )}
                            </button>
                          ))}
                          {!filteredNanoModels.length && (
                            <div className="nano-status">
                              No models loaded yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* OpenRouter Model List */}
                    {config.provider === "openrouter" && (
                      <div className="nano-models">
                        <div className="nano-status">
                          <div>
                            {openrouterModelsStatus ||
                              "Load models from OpenRouter."}
                          </div>
                          {openrouterModelsFetchedAt && (
                            <div className="nano-meta">
                              Last fetched:{" "}
                              {new Date(
                                openrouterModelsFetchedAt,
                              ).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                        <div className="nano-model-actions">
                          <input
                            className="field"
                            placeholder="Filter models..."
                            value={openrouterModelQuery}
                            onChange={(e) =>
                              setOpenrouterModelQuery(e.target.value)
                            }
                          />
                          {openrouterModelQuery && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={() => setOpenrouterModelQuery("")}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="nano-model-list">
                          {filteredOpenrouterModels.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className={clsx("model-pill", {
                                active:
                                  (config.models?.openrouter ||
                                    config.model) === m.id,
                              })}
                              onClick={() => applyOpenrouterModel(m.id)}
                              title={m.label}
                            >
                              <span className="label">{m.id}</span>
                              {m.pricing && (
                                <span className="meta">{m.pricing}</span>
                              )}
                            </button>
                          ))}
                          {!filteredOpenrouterModels.length && (
                            <div className="nano-status">
                              No models loaded yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="settings-actions">
                  {statusMsg && (
                    <div
                      className={clsx("status-msg", { error: !statusMsg.ok })}
                    >
                      {statusMsg.text}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={testConnection}
                    disabled={isTesting}
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </button>
                </div>
              </div>
            )}

            {settingsTab === "imageModels" && config.provider === "nanogpt" && (
              <div className="section">
                <div className="section-title">Image Models</div>
                <p className="section-desc">
                  Select and configure image generation models.
                </p>

                <div className="settings-row">
                  <div className="row-label">Image Model</div>
                  <div
                    className="row-content"
                    style={{ flexDirection: "column", gap: 10 }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <input
                        className="field"
                        value={config.imageModel || ""}
                        onChange={(e) =>
                          setConfig((prev: UiConfig) => ({
                            ...prev,
                            imageModel: e.target.value,
                          }))
                        }
                        placeholder="Enter image model or select below"
                      />
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={fetchNanoImageModels}
                        disabled={nanoImageModelsLoading}
                      >
                        {nanoImageModelsLoading ? "Loading..." : "Load Models"}
                      </button>
                    </div>

                    <div className="nano-models">
                      <div className="nano-status">
                        <div>
                          {nanoImageModelsStatus ||
                            "Load image models using your NanoGPT API key."}
                        </div>
                        {nanoImageModelsFetchedAt && (
                          <div className="nano-meta">
                            Last fetched:{" "}
                            {new Date(
                              nanoImageModelsFetchedAt,
                            ).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                      <div className="nano-model-actions">
                        <div className="segmented nano-scope-toggle">
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: nanoImageModelScope === "subscription",
                            })}
                            onClick={() =>
                              setNanoImageModelScope("subscription")
                            }
                          >
                            Subscription
                          </button>
                          <button
                            type="button"
                            className={clsx("seg", {
                              active: nanoImageModelScope === "paid",
                            })}
                            onClick={() => setNanoImageModelScope("paid")}
                          >
                            Paid
                          </button>
                        </div>
                        <input
                          className="field"
                          placeholder="Filter image models..."
                          value={nanoImageModelQuery}
                          onChange={(e) =>
                            setNanoImageModelQuery(e.target.value)
                          }
                        />
                        {nanoImageModelQuery && (
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => setNanoImageModelQuery("")}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="nano-model-list">
                        {filteredNanoImageModels.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={clsx("model-pill", {
                              active: config.imageModel === m.id,
                            })}
                            onClick={() => applyNanoImageModel(m.id)}
                            title={m.label}
                          >
                            <span className="label">{m.id}</span>
                            {m.pricing && (
                              <span className="meta">{m.pricing}</span>
                            )}
                          </button>
                        ))}
                        {!filteredNanoImageModels.length && (
                          <div className="nano-status">
                            No image models loaded yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="row-label">Image Size</div>
                  <div className="row-content">
                    <select
                      className="field"
                      value={config.imageSize || "1024x1024"}
                      onChange={(e) =>
                        setConfig((prev: UiConfig) => ({
                          ...prev,
                          imageSize: e.target.value,
                        }))
                      }
                    >
                      {defaultImageResolutions.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="row-label">Inference Steps</div>
                  <div className="row-content">
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={100}
                      value={config.imageSteps ?? 28}
                      onChange={(e) =>
                        setConfig((prev: UiConfig) => ({
                          ...prev,
                          imageSteps: Number(e.target.value) || 28,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <div className="row-label">Guidance Scale</div>
                  <div className="row-content">
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={20}
                      step={0.5}
                      value={config.imageGuidanceScale ?? 3}
                      onChange={(e) =>
                        setConfig((prev: UiConfig) => ({
                          ...prev,
                          imageGuidanceScale: Number(e.target.value) || 3,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {settingsTab === "imageModels" && config.provider !== "nanogpt" && (
              <div className="section">
                <div className="section-title">Image Generation</div>
                <p className="section-desc" style={{ color: "var(--muted)" }}>
                  Image generation is only available with the NanoGPT provider.
                  Switch to NanoGPT in the Text Models tab to enable image
                  generation.
                </p>
              </div>
            )}

            {settingsTab === "shortcuts" && (
              <ShortcutsPanel
                customShortcuts={customShortcuts}
                setCustomShortcuts={setCustomShortcuts}
                editingShortcut={editingShortcut}
                setEditingShortcut={setEditingShortcut}
                recordingKey={recordingKey}
                setRecordingKey={setRecordingKey}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
