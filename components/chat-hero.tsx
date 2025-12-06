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

          {/* Voice/Send Button */}
          <button type="button" className="voice-btn" onClick={onSend} title="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22,2 15,22 11,13 2,9" />
            </svg>
          </button>
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
      </div>
    </div>
  );
}

