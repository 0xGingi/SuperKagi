"use client";

import { useCallback, useEffect } from "react";

type ShortcutHandler = () => void;

interface KeyboardShortcuts {
  [key: string]: ShortcutHandler;
}

export interface CustomShortcuts {
  [action: string]: string;
}

export interface ShortcutConfig {
  action: string;
  label: string;
  defaultKey: string;
}

export const DEFAULT_SHORTCUTS = {
  NEW_CHAT: "ctrl+n",
  TOGGLE_SIDEBAR: "ctrl+b",
  TOGGLE_CONFIG: "ctrl+,",
  TOGGLE_DEEP_SEARCH: "ctrl+d",
  FOCUS_SEARCH: "ctrl+k",
  EXPORT_CHAT: "ctrl+e",
  TOGGLE_THEME: "ctrl+t",
} as const;

export const SHORTCUTS = DEFAULT_SHORTCUTS;

export const SHORTCUT_CONFIGS: ShortcutConfig[] = [
  {
    action: "NEW_CHAT",
    label: "New Chat",
    defaultKey: DEFAULT_SHORTCUTS.NEW_CHAT,
  },
  {
    action: "TOGGLE_SIDEBAR",
    label: "Toggle Sidebar",
    defaultKey: DEFAULT_SHORTCUTS.TOGGLE_SIDEBAR,
  },
  {
    action: "TOGGLE_CONFIG",
    label: "Toggle Settings",
    defaultKey: DEFAULT_SHORTCUTS.TOGGLE_CONFIG,
  },
  {
    action: "TOGGLE_DEEP_SEARCH",
    label: "Toggle Deep Search",
    defaultKey: DEFAULT_SHORTCUTS.TOGGLE_DEEP_SEARCH,
  },
  {
    action: "FOCUS_SEARCH",
    label: "Focus Search",
    defaultKey: DEFAULT_SHORTCUTS.FOCUS_SEARCH,
  },
  {
    action: "EXPORT_CHAT",
    label: "Export Chat",
    defaultKey: DEFAULT_SHORTCUTS.EXPORT_CHAT,
  },
  {
    action: "TOGGLE_THEME",
    label: "Toggle Theme",
    defaultKey: DEFAULT_SHORTCUTS.TOGGLE_THEME,
  },
];

const CUSTOM_SHORTCUTS_KEY = "customShortcuts";

export function loadCustomShortcuts(): CustomShortcuts {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(CUSTOM_SHORTCUTS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveCustomShortcuts(shortcuts: CustomShortcuts): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(shortcuts));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export function formatShortcutDisplay(shortcut: string): string {
  if (!shortcut) return "";

  const parts = shortcut.split("+");
  const formatted = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === "ctrl") return "Ctrl";
    if (lower === "shift") return "Shift";
    if (lower === "alt") return "Alt";
    if (lower === "meta") return "⌘";
    if (lower === ",") return ",";
    return part.charAt(0).toUpperCase() + part.slice(1);
  });

  return formatted.join(" + ");
}

export function parseKeyboardEvent(event: KeyboardEvent): string {
  const key = [];
  if (event.ctrlKey || event.metaKey) key.push("ctrl");
  if (event.shiftKey) key.push("shift");
  if (event.altKey) key.push("alt");

  // Don't include modifier keys as the main key
  if (!["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    key.push(event.key.toLowerCase());
  }

  return key.length > 1 ? key.join("+") : "";
}

export function isShortcutValid(shortcut: string): boolean {
  if (!shortcut) return false;
  const parts = shortcut.split("+");
  // Must have at least one modifier and one key
  return parts.length >= 2 && parts[parts.length - 1] !== "";
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) {
        return;
      }

      const key = [];
      if (event.ctrlKey || event.metaKey) key.push("ctrl");
      if (event.shiftKey) key.push("shift");
      if (event.altKey) key.push("alt");
      key.push(event.key.toLowerCase());

      const shortcut = key.join("+");

      if (shortcuts[shortcut]) {
        event.preventDefault();
        shortcuts[shortcut]();
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
