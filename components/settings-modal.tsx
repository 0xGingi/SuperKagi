"use client";

import clsx from "clsx";
import type { Dispatch, SetStateAction } from "react";
import { ShortcutsPanel } from "@/components/shortcuts-panel";
import type { CustomShortcuts } from "@/lib/keyboard-shortcuts";
import type {
  ImageModelOption,
  ModelOption,
  ServerDefaults,
  UiConfig,
} from "@/types/chat";

type SettingsTab = "settings" | "shortcuts";

type Props = {
  show: boolean;
  onClose: () => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  theme: string;
  setTheme: (theme: "light" | "dark" | "system") => void;
  config: UiConfig;
  setConfig: Dispatch<SetStateAction<UiConfig>>;
  serverDefaults: ServerDefaults;
  statusMsg: { text: string; ok?: boolean } | null;
  isTesting: boolean;
  onTest: () => void;
  onReset: () => void;
  onSave: () => void;
  providerApiKey: string;
  setProvider: (value: UiConfig["provider"]) => void;
  nanoModelScope: "subscription" | "paid";
  setNanoModelScope: (scope: "subscription" | "paid") => void;
  nanoModelQuery: string;
  setNanoModelQuery: (value: string) => void;
  nanoModelsStatus: string;
  nanoModelsLoading: boolean;
  nanoModelsFetchedAt: number | null;
  filteredNanoModels: ModelOption[];
  applyNanoModel: (id: string) => void;
  fetchNanoModels: () => void;
  openrouterModelQuery: string;
  setOpenrouterModelQuery: (value: string) => void;
  openrouterModelsStatus: string;
  openrouterModelsLoading: boolean;
  openrouterModelsFetchedAt: number | null;
  filteredOpenrouterModels: ModelOption[];
  applyOpenrouterModel: (id: string) => void;
  fetchOpenrouterModels: () => void;
  imageSettingsExpanded: boolean;
  setImageSettingsExpanded: (value: boolean) => void;
  nanoImageModelScope: "subscription" | "paid";
  setNanoImageModelScope: (scope: "subscription" | "paid") => void;
  nanoImageModelQuery: string;
  setNanoImageModelQuery: (value: string) => void;
  nanoImageModelsStatus: string;
  nanoImageModelsLoading: boolean;
  nanoImageModelsFetchedAt: number | null;
  filteredNanoImageModels: ImageModelOption[];
  applyNanoImageModel: (id: string) => void;
  fetchNanoImageModels: () => void;
  imageResolutionOptions: string[];
  activeImageModel?: ImageModelOption;
  nanoImageModels: ImageModelOption[];
  customShortcuts: CustomShortcuts;
  setCustomShortcuts: (value: CustomShortcuts) => void;
  editingShortcut: string | null;
  setEditingShortcut: (value: string | null) => void;
  recordingKey: string;
  setRecordingKey: (value: string) => void;
};

export function SettingsModal({
  show,
  onClose,
  settingsTab,
  setSettingsTab,
  theme,
  setTheme,
  config,
  setConfig,
  serverDefaults,
  statusMsg,
  isTesting,
  onTest,
  onReset,
  onSave,
  providerApiKey,
  setProvider,
  nanoModelScope,
  setNanoModelScope,
  nanoModelQuery,
  setNanoModelQuery,
  nanoModelsStatus,
  nanoModelsLoading,
  nanoModelsFetchedAt,
  filteredNanoModels,
  applyNanoModel,
  fetchNanoModels,
  openrouterModelQuery,
  setOpenrouterModelQuery,
  openrouterModelsStatus,
  openrouterModelsLoading,
  openrouterModelsFetchedAt,
  filteredOpenrouterModels,
  applyOpenrouterModel,
  fetchOpenrouterModels,
  imageSettingsExpanded,
  setImageSettingsExpanded,
  nanoImageModelScope,
  setNanoImageModelScope,
  nanoImageModelQuery,
  setNanoImageModelQuery,
  nanoImageModelsStatus,
  nanoImageModelsLoading,
  nanoImageModelsFetchedAt,
  filteredNanoImageModels,
  applyNanoImageModel,
  fetchNanoImageModels,
  imageResolutionOptions,
  activeImageModel,
  nanoImageModels,
  customShortcuts,
  setCustomShortcuts,
  editingShortcut,
  setEditingShortcut,
  recordingKey,
  setRecordingKey,
}: Props) {
  if (!show) return null;

  return (
    <div
      className="modal show"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
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
            onClick={onClose}
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
                          config.models?.[config.provider] || config.model || ""
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
                          {openrouterModelsLoading
                            ? "Fetching…"
                            : "Load models"}
                        </button>
                      )}
                    </div>

                    {config.provider === "nanogpt" && (
                      <div className="nano-models">
                        <div className="nano-status">
                          <div>
                            {nanoModelsStatus ||
                              "Uses your NanoGPT API key to load subscription models."}
                          </div>
                          {nanoModelsFetchedAt ? (
                            <div className="nano-meta">
                              Last fetched at{" "}
                              {new Date(
                                nanoModelsFetchedAt,
                              ).toLocaleTimeString()}
                            </div>
                          ) : null}
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
                            id="nanogpt-model-search"
                            placeholder="Filter NanoGPT models"
                            value={nanoModelQuery}
                            onChange={(e) => setNanoModelQuery(e.target.value)}
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
                                    (config.models?.nanogpt || config.model) ===
                                    m.id,
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
                          <div>
                            {openrouterModelsStatus ||
                              "Uses your OpenRouter API key to load available models."}
                          </div>
                          {openrouterModelsFetchedAt ? (
                            <div className="nano-meta">
                              Last fetched at{" "}
                              {new Date(
                                openrouterModelsFetchedAt,
                              ).toLocaleTimeString()}
                            </div>
                          ) : null}
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
                      value={providerApiKey || ""}
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
                      onChange={(e) =>
                        setConfig((prev) => {
                          if (prev.provider === "openrouter") {
                            return {
                              ...prev,
                              apiKeyOpenrouter: e.target.value,
                            };
                          }
                          if (prev.provider === "nanogpt") {
                            return {
                              ...prev,
                              apiKeyNanogpt: e.target.value,
                            };
                          }
                          return prev;
                        })
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
                            .writeText(providerApiKey || "")
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
                    display: config.provider === "nanogpt" ? "grid" : "none",
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
                      {config.provider === "nanogpt" && (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={fetchNanoImageModels}
                          disabled={nanoImageModelsLoading}
                        >
                          {nanoImageModelsLoading
                            ? "Fetching…"
                            : "Load image models"}
                        </button>
                      )}
                    </div>
                    {config.provider === "nanogpt" && (
                      <div className="nano-models">
                        <div className="nano-status">
                          <div>
                            {nanoImageModelsStatus ||
                              "Load available NanoGPT image models."}
                          </div>
                          {nanoImageModels.length ? (
                            <div className="nano-meta">
                              Loaded {nanoImageModels.length} models
                            </div>
                          ) : null}
                          {nanoImageModelsFetchedAt ? (
                            <div className="nano-meta">
                              Last fetched at{" "}
                              {new Date(
                                nanoImageModelsFetchedAt,
                              ).toLocaleTimeString()}
                            </div>
                          ) : null}
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
                            id="nanogpt-image-model-search"
                            placeholder="Filter NanoGPT image models"
                            value={nanoImageModelQuery}
                            onChange={(e) =>
                              setNanoImageModelQuery(e.target.value)
                            }
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => setNanoImageModelQuery("")}
                            disabled={!nanoImageModelQuery}
                          >
                            Clear
                          </button>
                        </div>
                        <div className="nano-model-list">
                          {filteredNanoImageModels.length ? (
                            filteredNanoImageModels.map((m) => {
                              const metaParts = [
                                m.pricing,
                                m.defaultSize,
                                m.defaultSteps
                                  ? `${m.defaultSteps} steps`
                                  : null,
                                m.defaultGuidance
                                  ? `cfg ${m.defaultGuidance}`
                                  : null,
                              ].filter(Boolean);
                              return (
                                <button
                                  type="button"
                                  key={m.id}
                                  className={clsx("model-pill", {
                                    active: config.imageModel === m.id,
                                  })}
                                  onClick={() => applyNanoImageModel(m.id)}
                                  title={m.label}
                                >
                                  <span className="label">
                                    {m.name || m.id}
                                  </span>
                                  {metaParts.length ? (
                                    <span className="meta">
                                      {metaParts.join(" • ")}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          ) : (
                            <div className="nano-status">
                              No image models loaded yet.
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
                    display: config.provider === "nanogpt" ? "grid" : "none",
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
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Configure size, steps, and other parameters
                    </div>
                    {activeImageModel ? (
                      <div className="nano-status" style={{ marginTop: "8px" }}>
                        <div>
                          Active image model:{" "}
                          <strong>
                            {activeImageModel.name || activeImageModel.id}
                          </strong>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            marginTop: "4px",
                          }}
                        >
                          {activeImageModel.pricing ? (
                            <span className="meta">
                              Price: {activeImageModel.pricing}
                            </span>
                          ) : null}
                          {activeImageModel.defaultSize ? (
                            <span className="meta">
                              Recommended size: {activeImageModel.defaultSize}
                            </span>
                          ) : null}
                          {typeof activeImageModel.defaultSteps === "number" ? (
                            <span className="meta">
                              Recommended steps: {activeImageModel.defaultSteps}
                            </span>
                          ) : null}
                          {typeof activeImageModel.defaultGuidance ===
                          "number" ? (
                            <span className="meta">
                              Recommended CFG:{" "}
                              {activeImageModel.defaultGuidance}
                            </span>
                          ) : null}
                          {activeImageModel.resolutions?.length ? (
                            <span className="meta">
                              Supports {activeImageModel.resolutions.length}{" "}
                              sizes
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
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
                          {imageResolutionOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
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
                              imageSteps: parseInt(e.target.value, 10) || 30,
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
                    onClick={onReset}
                    title="Reset settings to server defaults"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={onTest}
                    disabled={isTesting}
                  >
                    Test Connection
                  </button>
                  <div style={{ flex: 1 }} />
                  <button type="button" className="chip" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="chip primary"
                    onClick={onSave}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
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
