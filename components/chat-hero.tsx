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
}: Props) {
  if (!isEmpty) return null;
  return (
    <div className="hero">
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
            ref={inputRef}
            placeholder="What do you want to know?"
            value={heroValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend()}
          />
          <div className="input-actions">
            {configProvider === "nanogpt" && (
              <button
                type="button"
                className="chip"
                onClick={onGenerateImage}
                disabled={isGeneratingImage}
                title="Generate Image"
              >
                {isGeneratingImage ? "…" : "IMG"}
              </button>
            )}
            <button type="button" className="chip primary" onClick={onSend}>
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

        <button type="button" className="chip" onClick={onOpenConfig}>
          Config
        </button>
      </div>
    </div>
  );
}
