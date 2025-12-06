"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { formatCost } from "@/lib/chat-utils";
import { useChatStore } from "@/lib/store/chat-store";
import { useUIStore } from "@/lib/store/ui-store";

type Props = {
  onExport: () => void;
  extraNav?: ReactNode;
};

export function ChatSidebar({ onExport, extraNav }: Props) {
  const {
    chats,
    currentChatId,
    searchQuery,
    setSearchQuery,
    createChat,
    deleteChat,
    setCurrentChatId,
  } = useChatStore();

  const {
    sidebarOpen,
    sidebarCollapsed,
    setSidebarOpen,
    setSidebarCollapsed,
    setShowConfig,
  } = useUIStore();

  // Derived filtered listing
  const filteredChatItems = (() => {
    const q = searchQuery.toLowerCase();
    return Object.keys(chats)
      .sort() // Sort logic should match page.tsx (reverse chronological usually by ID or created)
      .reverse() // Assuming IDs are timestamps
      .map((id) => {
        const last = (chats[id] || [])
          .slice()
          .reverse()
          .find((m) => m.role === "user");
        const lastTime =
          last?.createdAt ||
          (chats[id] || []).find((m) => m.createdAt)?.createdAt ||
          parseInt(id, 10) ||
          Date.now();
        const dateText = new Date(lastTime).toLocaleDateString();
        const timeText = new Date(lastTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
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

        const totalCost = (chats[id] || []).reduce(
          (sum, msg) => sum + (msg.cost || 0),
          0,
        );
        const costText = totalCost > 0 ? formatCost(totalCost) : "";
        return { id, label, dateText, timeText, costText };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  })();

  function handleNewChat() {
    createChat();
    // Assuming createChat updates currentChatId in store
    if (window.innerWidth <= 780) {
      setSidebarOpen(false);
    }
  }

  function handleSwitchChat(id: string) {
    setCurrentChatId(id);
    localStorage.setItem("currentChatId", id); // Manual sync if persisted store doesn't handle this immediately?
    // Actually store persists 'currentChatId', so no need for manual localStorage if store is used correctly.
    // But page.tsx did it manually too. Let's trust store.
    if (window.innerWidth <= 780) {
      setSidebarOpen(false);
    }
  }

  function handleToggleSidebar() {
    if (window.innerWidth <= 780) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  }

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
            onClick={handleToggleSidebar}
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

        <nav className="sidebar-nav">
          {/* Chat / New Chat */}
          <button
            type="button"
            className="nav-item-icon"
            onClick={handleNewChat}
            title="New Chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>New Chat</span>
          </button>

          {/* Config/Settings */}
          <button
            type="button"
            className="nav-item-icon"
            onClick={() => setShowConfig(true)}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>

          {/* Export */}
          <button
            type="button"
            className="nav-item-icon"
            onClick={onExport}
            title="Export"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export</span>
          </button>

          {extraNav}
        </nav>

        <div className="sidebar-search">
          <div className="search-input">
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
              id="chat-search"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <h3 className="section-title">History</h3>
        <ul className="chat-list" id="chat-list">
          {filteredChatItems.map((item) => (
            <li key={item.id} onClick={() => handleSwitchChat(item.id)}>
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
                    deleteChat(item.id);
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
        onClick={() => setSidebarOpen(false)}
      />
    </>
  );
}
