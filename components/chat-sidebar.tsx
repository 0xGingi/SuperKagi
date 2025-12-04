"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

type ChatListItem = {
  id: string;
  label: string;
  dateText: string;
  timeText: string;
  costText: string;
};

type Props = {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  onToggle: () => void;
  onCloseOverlay: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onNewChat: () => void;
  onOpenConfig: () => void;
  onExport: () => void;
  chats: ChatListItem[];
  currentChatId: string;
  onDeleteChat: (id: string) => void;
  onSwitchChat: (id: string) => void;
  extraNav?: ReactNode;
};

export function ChatSidebar({
  sidebarOpen,
  sidebarCollapsed: _sidebarCollapsed,
  onToggle,
  onCloseOverlay,
  searchQuery,
  setSearchQuery,
  onNewChat,
  onOpenConfig,
  onExport,
  chats,
  currentChatId,
  onDeleteChat,
  onSwitchChat,
  extraNav,
}: Props) {
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
            onClick={onToggle}
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
            onClick={onNewChat}
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
            onClick={onOpenConfig}
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
          <button
            type="button"
            className="chip w-full"
            onClick={onExport}
            title="Export current chat"
            aria-label="Export current chat"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          {extraNav}
        </nav>
        <h3 className="section-title">Chats</h3>
        <ul className="chat-list" id="chat-list">
          {chats.map((item) => (
            <li key={item.id} onClick={() => onSwitchChat(item.id)}>
              <div
                className={clsx("chat-item", {
                  active: item.id === currentChatId,
                })}
                title={item.label}
              >
                <div>
                  <span className="chat-title">{item.label}</span>
                  <span className="chat-meta">
                    {item.dateText} • {item.timeText}
                    {item.costText ? ` • ${item.costText}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="mini-btn icon-only"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(item.id);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div
        className={clsx("sidebar-overlay", { show: sidebarOpen })}
        onClick={onCloseOverlay}
      />
    </>
  );
}
