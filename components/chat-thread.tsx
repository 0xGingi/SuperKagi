"use client";

import clsx from "clsx";
import Image from "next/image";
import type { RefObject } from "react";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { ChatMessage } from "@/types/chat";

type Props = {
  thread: ChatMessage[];
  visibleThread: ChatMessage[];
  searchActive: boolean;
  totalCount: number;
  visibleCount: number;
  editingMessageId: string | null;
  editDraft: string;
  editInputRef: RefObject<HTMLTextAreaElement | null>;
  regeneratingId: string | null;
  copiedId: string | null;
  messageSearch: string;
  setMessageSearch: (value: string) => void;
  onCopyMessage: (msg: ChatMessage) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onRegenerate: (id: string) => void;
  onRetry: (id: string) => void;
  formatMessageTime: (msg: ChatMessage) => string;
  formatCost: (cost?: number | null) => string;
  renderMarkdown?: boolean;
  showReasoning: boolean;
  onToggleReasoning: () => void;
};

function _messageText(content: ChatMessage["content"]): string {
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

function sanitizeUrl(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  return /^(https?:|data:|blob:)/i.test(trimmed) ? trimmed : "";
}

function sanitizeFilename(value?: string): string {
  if (!value) return "";
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function ChatThread({
  thread,
  visibleThread,
  searchActive,
  totalCount,
  visibleCount,
  editingMessageId,
  editDraft,
  editInputRef,
  regeneratingId,
  copiedId,
  messageSearch,
  setMessageSearch,
  onCopyMessage,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  onRegenerate,
  onRetry,
  formatMessageTime,
  formatCost,
  showReasoning,
  onToggleReasoning,
}: Props) {
  async function downloadImage(url: string) {
    try {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) throw new Error("Invalid download URL");
      const baseName =
        safeUrl.split("/").pop()?.split("?")[0] || `image-${Date.now()}.png`;
      const safeFilename = sanitizeFilename(baseName) || "generated-image.png";
      const normalizedUrl = safeUrl.toLowerCase();
      if (
        normalizedUrl.startsWith("data:") ||
        normalizedUrl.startsWith("blob:")
      ) {
        const link = document.createElement("a");
        link.href = safeUrl;
        link.download = safeFilename;
        link.rel = "noopener noreferrer";
        link.click();
        return;
      }

      const resp = await fetch(safeUrl, { mode: "cors" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = safeFilename;
      link.rel = "noopener noreferrer";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.warn("Download failed", err);
      // Fallback: open in new tab so the user can save manually.
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (win) win.opener = null;
    }
  }

  const renderMessageContent = (msg: ChatMessage) => {
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
            <div
              key={part.image_url.url}
              className="generated-image-wrap"
              style={{ position: "relative" }}
            >
              <Image
                src={part.image_url.url}
                alt="Generated content"
                className="generated-image"
                loading="lazy"
                width={640}
                height={640}
                sizes="100vw"
                unoptimized
              />
              <div className="generated-image-actions">
                <button
                  type="button"
                  className="mini-btn ghost"
                  onClick={() => downloadImage(part.image_url.url)}
                >
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return <MarkdownRenderer content={msg.content || ""} />;
  };

  return (
    <div
      className="chat-thread"
      aria-live="polite"
      aria-relevant="additions"
      style={{ display: thread.length === 0 ? "none" : undefined }}
    >
      {thread.length ? (
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
          <div className="thread-actions">
            <button
              type="button"
              className="mini-btn ghost"
              onClick={onToggleReasoning}
              aria-pressed={showReasoning}
            >
              Reasoning: {showReasoning ? "Shown" : "Hidden"}
            </button>
          </div>
        </div>
      ) : null}
      {searchActive && !visibleThread.length ? (
        <div className="search-empty">
          No messages match “{messageSearch.trim()}”.
        </div>
      ) : null}
      {visibleThread.map((msg, idx) => {
        const messageId = msg.id || `${idx}`;
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
            <div
              className={clsx("bubble", msg.role, {
                typing: msg.pending,
              })}
            >
              {isEditingMessage ? (
                <div className="edit-block">
                  <textarea
                    className="field field-textarea"
                    ref={editInputRef}
                    value={editDraft}
                    onChange={(e) => onEditDraftChange(e.target.value)}
                    rows={Math.max(3, editDraft.split("\n").length)}
                  />
                  <div className="edit-actions">
                    <button
                      type="button"
                      className="chip primary"
                      onClick={onSaveEdit}
                    >
                      Save &amp; resend
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={onCancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {showReasoning && msg.reasoning ? (
                    <section
                      className="reasoning-block"
                      aria-label="Model reasoning"
                    >
                      <div className="reasoning-label">Reasoning</div>
                      <MarkdownRenderer
                        content={msg.reasoning}
                        className="reasoning-markdown"
                      />
                    </section>
                  ) : null}
                  {renderMessageContent(msg)}
                  {msg.pending ? (
                    <output className="typing-dots" aria-live="polite">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </output>
                  ) : null}
                </>
              )}
            </div>
            <div className="message-actions">
              <button
                type="button"
                className="mini-btn ghost"
                title="Copy message"
                onClick={() => onCopyMessage(msg)}
              >
                {isCopying ? "Copied" : "Copy"}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="mini-btn ghost"
                  title="Edit message"
                  onClick={() => onStartEdit(msg)}
                >
                  Edit
                </button>
              )}
              {canRegenerate && (
                <button
                  type="button"
                  className="mini-btn ghost"
                  title="Regenerate response"
                  onClick={() => onRegenerate(messageId)}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? "…" : "Regenerate"}
                </button>
              )}
            </div>
            <div className="message-meta">
              {formatMessageTime(msg)}
              {msg.cost != null && !Number.isNaN(msg.cost)
                ? ` • ${formatCost(msg.cost)}`
                : ""}
              {msg.edited ? " • Edited" : ""}
            </div>
            {errorText ? (
              <div className="message-error">
                <div className="error-text">{errorText}</div>
                {canRegenerate ? (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => onRetry(messageId)}
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
  );
}
