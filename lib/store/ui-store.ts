import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CustomShortcuts } from "@/lib/keyboard-shortcuts";

interface UIState {
  showConfig: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  heroValue: string;
  composerValue: string;
  statusMsg: { text: string; ok?: boolean } | null;
  settingsTab:
  | "settings"
  | "connection"
  | "textModels"
  | "imageModels"
  | "shortcuts"
  | "users";
  customShortcuts: CustomShortcuts;
  editingShortcut: string | null;
  recordingKey: string;
  editingMessageId: string | null;
  editDraft: string;
  imageSettingsExpanded: boolean;
  showReasoning: boolean;

  setShowConfig: (show: boolean) => void;
  setSidebarOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarCollapsed: (
    updater: boolean | ((prev: boolean) => boolean),
  ) => void;
  setHeroValue: (value: string) => void;
  setComposerValue: (value: string) => void;
  setStatusMsg: (msg: { text: string; ok?: boolean } | null) => void;
  setSettingsTab: (
    tab: "settings" | "connection" | "textModels" | "imageModels" | "shortcuts" | "users",
  ) => void;
  setCustomShortcuts: (shortcuts: CustomShortcuts) => void;
  setEditingShortcut: (id: string | null) => void;
  setRecordingKey: (key: string) => void;
  setEditingMessageId: (id: string | null) => void;
  setEditDraft: (draft: string) => void;
  setImageSettingsExpanded: (expanded: boolean) => void;
  setShowReasoning: (show: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      showConfig: false,
      sidebarOpen: false,
      sidebarCollapsed: false,
      heroValue: "",
      composerValue: "",
      statusMsg: null,
      settingsTab: "settings",
      customShortcuts: {},
      editingShortcut: null,
      recordingKey: "",
      editingMessageId: null,
      editDraft: "",
      imageSettingsExpanded: false,
      showReasoning: true,

      setShowConfig: (show) => set({ showConfig: show }),
      setSidebarOpen: (updater) =>
        set((state) => ({
          sidebarOpen:
            typeof updater === "function"
              ? (updater as any)(state.sidebarOpen)
              : updater,
        })),
      setSidebarCollapsed: (updater) =>
        set((state) => ({
          sidebarCollapsed:
            typeof updater === "function"
              ? (updater as any)(state.sidebarCollapsed)
              : updater,
        })),
      setHeroValue: (value) => set({ heroValue: value }),
      setComposerValue: (value) => set({ composerValue: value }),
      setStatusMsg: (msg) => set({ statusMsg: msg }),
      setSettingsTab: (tab) => set({ settingsTab: tab }),
      setCustomShortcuts: (shortcuts) => set({ customShortcuts: shortcuts }),
      setEditingShortcut: (id) => set({ editingShortcut: id }),
      setRecordingKey: (key) => set({ recordingKey: key }),
      setEditingMessageId: (id) => set({ editingMessageId: id }),
      setEditDraft: (draft) => set({ editDraft: draft }),
      setImageSettingsExpanded: (expanded) =>
        set({ imageSettingsExpanded: expanded }),
      setShowReasoning: (show) => set({ showReasoning: show }),
    }),
    {
      name: "superkagi-ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        showReasoning: state.showReasoning,
      }),
    },
  ),
);
