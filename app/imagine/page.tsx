"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SettingsModal } from "@/components/settings-modal";
import { defaultImageResolutions } from "@/lib/config-utils";
import { useConfigStore } from "@/lib/store/config-store";
import { type GeneratedImage, useImageStore } from "@/lib/store/image-store";
import { useModelStore } from "@/lib/store/model-store";
import { useUIStore } from "@/lib/store/ui-store";

const PROMPT_SUGGESTIONS = [
  "A mystical forest at dawn",
  "Cyberpunk city skyline",
  "Abstract geometric art",
  "Serene mountain lake",
];

export default function ImaginePage() {
  const { config, setConfig } = useConfigStore();
  const {
    images,
    selectedImageId,
    isGenerating,
    generationError,
    addImage,
    removeImage,
    clearAllImages,
    setSelectedImageId,
    setIsGenerating,
    setGenerationError,
  } = useImageStore();
  const {
    nanoImageModels,
    nanoImageModelsLoading,
    nanoImageModelsStatus,
    fetchNanoImageModels,
  } = useModelStore();
  const { showConfig, setShowConfig, setSettingsTab } = useUIStore();

  const [prompt, setPrompt] = useState("");
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(true);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const selectedImage = images.find((img) => img.id === selectedImageId);
  const activeImageModel = nanoImageModels.find(
    (m) => m.id === config.imageModel,
  );
  const supportsImg2Img = !!activeImageModel?.supportsImg2Img;
  const imageResolutionOptions = activeImageModel?.resolutions?.length
    ? activeImageModel.resolutions
    : defaultImageResolutions;

  // Auto-fetch image models if none loaded
  useEffect(() => {
    if (
      config.provider === "nanogpt" &&
      config.apiKeyNanogpt &&
      nanoImageModels.length === 0
    ) {
      fetchNanoImageModels();
    }
  }, [
    config.provider,
    config.apiKeyNanogpt,
    nanoImageModels.length,
    fetchNanoImageModels,
  ]);

  // Load images from server on mount
  useEffect(() => {
    const loadServerImages = async () => {
      try {
        const res = await fetch("/api/persistence/images", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.images) && data.images.length > 0) {
            // Replace local images with server images
            const { images: localImages } = useImageStore.getState();
            if (localImages.length === 0) {
              // Only set from server if local is empty
              useImageStore.setState({ images: data.images });
            }
          }
        }
      } catch {
        // Silent fail - use local storage as fallback
      }
    };
    loadServerImages();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    if (config.provider !== "nanogpt") {
      setGenerationError("Image generation requires NanoGPT provider");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const res = await fetch("/api/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: config.imageModel || "chroma",
          size: config.imageSize,
          num_inference_steps: config.imageSteps,
          guidance_scale: config.imageGuidanceScale,
          seed: config.imageSeed,
          apiKey: config.apiKeyNanogpt,
          ...(supportsImg2Img && sourceImage
            ? { imageDataUrl: sourceImage }
            : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.images?.[0]?.url) {
        throw new Error(
          data.error || data.details || "Image generation failed",
        );
      }

      const newImage: GeneratedImage = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        url: data.images[0].url,
        prompt: prompt.trim(),
        model: config.imageModel || "chroma",
        size: config.imageSize || "1024x1024",
        steps: config.imageSteps || 30,
        guidanceScale: config.imageGuidanceScale || 7.5,
        seed: config.imageSeed,
        cost: data.cost,
        createdAt: Date.now(),
        sourceImageUrl: sourceImage || undefined,
      };

      addImage(newImage);

      // Save to server for persistence
      try {
        await fetch("/api/persistence/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newImage),
        });
      } catch {
        // Silent fail - local storage is still saved
      }

      setPrompt("");
      setSourceImage(null);
    } catch (e) {
      setGenerationError((e as Error).message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setSourceImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setSourceImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const downloadImage = async (img: GeneratedImage) => {
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `imagine-${img.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(img.url, "_blank");
    }
  };

  const copyImageUrl = (img: GeneratedImage) => {
    navigator.clipboard.writeText(img.url);
  };

  const regenerate = (img: GeneratedImage) => {
    setPrompt(img.prompt);
    setConfig((prev) => ({
      ...prev,
      imageModel: img.model,
      imageSize: img.size,
      imageSteps: img.steps,
      imageGuidanceScale: img.guidanceScale,
      imageSeed: img.seed,
    }));
    promptRef.current?.focus();
  };

  const usePromptSuggestion = (suggestion: string) => {
    setPrompt(suggestion);
    promptRef.current?.focus();
  };

  return (
    <div className="imagine-page">
      {/* Header */}
      <header className="imagine-header">
        <div className="imagine-header-left">
          <Link href="/" className="imagine-back-btn" title="Back to Chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
            </svg>
            Imagine
          </h1>
        </div>
        <div className="imagine-header-actions">
          {images.length > 0 && (
            <div className="imagine-header-stats">
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21,15 16,10 5,21" />
                </svg>
                {images.length} images
              </span>
            </div>
          )}
          <button
            type="button"
            className="icon-btn"
            title="Settings"
            onClick={() => {
              setSettingsTab("imageModels");
              setShowConfig(true);
            }}
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
          </button>
        </div>
      </header>

      {/* Dashboard Layout */}
      <div className="imagine-dashboard">
        {/* Left Panel - Controls */}
        <div className="imagine-left-panel">
          {/* Prompt Card */}
          <div
            className={clsx("imagine-prompt-card", { "drag-over": dragOver })}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="imagine-prompt-inner">
              {/* Source Image Preview */}
              {sourceImage && supportsImg2Img && (
                <div className="imagine-source-preview">
                  <img src={sourceImage} alt="Source" />
                  <button
                    type="button"
                    className="remove-source-btn"
                    onClick={() => setSourceImage(null)}
                    title="Remove source image"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <textarea
                ref={promptRef}
                className="imagine-prompt-input"
                placeholder="Describe the image you want to create..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
              />
            </div>

            <div className="imagine-prompt-footer">
              <span className="imagine-prompt-hint">
                <kbd>⌘</kbd> + <kbd>Enter</kbd> to generate
              </span>
              <div className="imagine-prompt-actions">
                {supportsImg2Img && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      title="Add source image for img2img"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21,15 16,10 5,21" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="imagine-generate-btn"
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <span className="spinner" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {generationError && (
            <div className="imagine-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {generationError}
            </div>
          )}

          {/* Quick Settings */}
          <div className="imagine-settings-card">
            <button
              type="button"
              className="imagine-settings-header"
              onClick={() => setQuickSettingsOpen(!quickSettingsOpen)}
            >
              <span>Quick Settings</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: quickSettingsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {quickSettingsOpen && (
              <div className="imagine-settings-body">
                <div className="imagine-setting">
                  <label htmlFor="imagine-model">Model</label>
                  <div className="imagine-setting-row">
                    <select
                      id="imagine-model"
                      className="field"
                      value={config.imageModel || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          imageModel: e.target.value,
                        }))
                      }
                    >
                      {nanoImageModels.length === 0 && (
                        <option value="">Select a model</option>
                      )}
                      {nanoImageModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id} {m.pricing ? `(${m.pricing})` : ""}{m.supportsImg2Img ? " [i2i]" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={fetchNanoImageModels}
                      disabled={nanoImageModelsLoading}
                    >
                      {nanoImageModelsLoading ? "..." : "↻"}
                    </button>
                  </div>
                  {nanoImageModelsStatus && (
                    <span className="imagine-setting-hint">{nanoImageModelsStatus}</span>
                  )}
                  {activeImageModel && (
                    <span className="imagine-setting-hint">
                      {activeImageModel.supportsImg2Img ? "✓ Supports img2img" : "Text-to-image only"}
                    </span>
                  )}
                </div>

                <div className="imagine-setting">
                  <label htmlFor="imagine-size">Size</label>
                  <select
                    id="imagine-size"
                    className="field"
                    value={config.imageSize || "1024x1024"}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        imageSize: e.target.value,
                      }))
                    }
                  >
                    {imageResolutionOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <div className="imagine-settings-card">
            <button
              type="button"
              className="imagine-settings-header"
              onClick={() => setAdvancedSettingsOpen(!advancedSettingsOpen)}
            >
              <span>Advanced Settings</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: advancedSettingsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {advancedSettingsOpen && (
              <div className="imagine-settings-body">
                <div className="imagine-setting">
                  <label htmlFor="imagine-steps">Steps: {config.imageSteps || 30}</label>
                  <input
                    id="imagine-steps"
                    type="range"
                    min="1"
                    max="100"
                    value={config.imageSteps || 30}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        imageSteps: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="imagine-setting">
                  <label htmlFor="imagine-guidance">Guidance: {config.imageGuidanceScale || 7.5}</label>
                  <input
                    id="imagine-guidance"
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={config.imageGuidanceScale || 7.5}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        imageGuidanceScale: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="imagine-setting">
                  <label htmlFor="imagine-seed">Seed (optional)</label>
                  <input
                    id="imagine-seed"
                    type="number"
                    className="field"
                    placeholder="Random"
                    value={config.imageSeed || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        imageSeed: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Gallery Canvas */}
        <div className="imagine-right-panel">
          <div className="imagine-gallery-canvas">
            <div className="imagine-gallery-header">
              <h2>
                Gallery
                {images.length > 0 && (
                  <span className="imagine-gallery-count">{images.length}</span>
                )}
              </h2>
              {images.length > 0 && (
                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={async () => {
                    if (confirm("Clear all generated images?")) {
                      // Get image IDs before clearing
                      const imageIds = images.map((img) => img.id);
                      clearAllImages();
                      // Delete all from server
                      for (const id of imageIds) {
                        try {
                          await fetch(`/api/persistence/images/${id}`, {
                            method: "DELETE",
                          });
                        } catch {
                          // Silent fail
                        }
                      }
                    }
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            {images.length === 0 ? (
              <div className="imagine-gallery-empty">
                <svg
                  className="imagine-empty-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21,15 16,10 5,21" />
                </svg>
                <h3>Create Your First Image</h3>
                <p>Enter a prompt to start generating amazing images with AI</p>
                <div className="imagine-prompt-suggestions">
                  {PROMPT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="imagine-prompt-suggestion"
                      onClick={() => usePromptSuggestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="imagine-gallery-grid">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="imagine-gallery-item"
                    onClick={() => setSelectedImageId(img.id)}
                  >
                    <img src={img.url} alt={img.prompt} loading="lazy" />
                    <div className="imagine-gallery-item-overlay">
                      <p>{img.prompt}</p>
                      <span className="imagine-gallery-item-model">{img.model}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="imagine-preview-modal"
          onClick={() => setSelectedImageId(null)}
        >
          <div
            className="imagine-preview-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="imagine-preview-close"
              onClick={() => setSelectedImageId(null)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="imagine-preview-image">
              <img src={selectedImage.url} alt={selectedImage.prompt} />
            </div>

            <div className="imagine-preview-info">
              <p className="imagine-preview-prompt">{selectedImage.prompt}</p>
              <div className="imagine-preview-meta">
                <span><strong>Model</strong> {selectedImage.model}</span>
                <span><strong>Size</strong> {selectedImage.size}</span>
                <span><strong>Steps</strong> {selectedImage.steps}</span>
                <span><strong>Guidance</strong> {selectedImage.guidanceScale}</span>
                {selectedImage.seed && <span><strong>Seed</strong> {selectedImage.seed}</span>}
                {selectedImage.cost && <span><strong>Cost</strong> ${selectedImage.cost.toFixed(4)}</span>}
              </div>

              <div className="imagine-preview-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => downloadImage(selectedImage)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => copyImageUrl(selectedImage)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy URL
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    regenerate(selectedImage);
                    setSelectedImageId(null);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Regenerate
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    removeImage(selectedImage.id);
                    setSelectedImageId(null);
                    // Delete from server
                    try {
                      await fetch(`/api/persistence/images/${selectedImage.id}`, {
                        method: "DELETE",
                      });
                    } catch {
                      // Silent fail
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showConfig && <SettingsModal />}
    </div>
  );
}
