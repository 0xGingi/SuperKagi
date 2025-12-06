"use client";

import clsx from "clsx";
import type { RefObject } from "react";

import { type Attachment, AttachmentList } from "@/components/attachment-list";

type Provider = "local" | "openrouter" | "nanogpt";

type Props = {
  isEmpty: boolean;
  heroValue: string;
  onChange: (value: string) => void;
  onSend: () => void;
  openFilePicker: () => void;
  toggleDeepSearch: () => void;
  deepOn: boolean;
  configProvider: Provider;
  isGeneratingImage: boolean;
  onGenerateImage: () => void;
  attachments: Attachment[];
  removeAttachment: (idx: number) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onOpenConfig: () => void;
  currentModel?: string;
};

export function ChatHero({
  isEmpty,
  heroValue,
  onChange,
  onSend,
  openFilePicker,
  toggleDeepSearch,
  deepOn,
  configProvider,
  isGeneratingImage,
  onGenerateImage,
  attachments,
  removeAttachment,
  inputRef,
  onOpenConfig,
  currentModel,
}: Props) {
  if (!isEmpty) return null;

  const displayModel = currentModel?.split("/").pop() || "Select Model";

  return (
    <div className="hero">
      <h1 className="hero-title">SuperKagi</h1>

      {/* Main Input */}
      <div className="hero-input">
        <div className="pill-input">
          <button
            type="button"
            className="icon-btn"
            title="Attach file"
            aria-label="Attach file"
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
            ref={inputRef}
            placeholder="What do you want to know?"
            value={heroValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend()}
          />

          <div className="input-actions">
            {/* Model Selector */}
            <button
              type="button"
              className="model-selector"
              onClick={onOpenConfig}
              title="Select model"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4" />
              </svg>
              {displayModel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Voice/Send Button */}
            <button type="button" className="voice-btn" onClick={onSend} title="Send message">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22,2 15,22 11,13 2,9" />
              </svg>
            </button>
          </div>
        </div>

        <AttachmentList
          attachments={attachments}
          removeAttachment={removeAttachment}
        />
      </div>

      {/* Feature Buttons */}
      <div className="hero-actions">
        <button
          type="button"
          className={clsx("chip", "toggle", { active: deepOn })}
          onClick={toggleDeepSearch}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          DeepSearch
        </button>

        {configProvider === "nanogpt" && (
          <button
            type="button"
            className="chip"
            onClick={onGenerateImage}
            disabled={isGeneratingImage}
            title="Generate Image"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
            {isGeneratingImage ? "Creating..." : "Create Image"}
          </button>
        )}

        <button type="button" className="chip" onClick={onOpenConfig}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}

