import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Attachment } from "@/components/attachment-list";
import type { ChatMap, ChatMessage } from "@/types/chat";

interface ChatState {
  chats: ChatMap;
  currentChatId: string;
  attachments: Attachment[];
  searchQuery: string;
  messageSearch: string;
  regeneratingId: string | null;
  copiedId: string | null;

  setChats: (updater: ChatMap | ((prev: ChatMap) => ChatMap)) => void;
  setCurrentChatId: (id: string) => void;
  setAttachments: (
    updater: Attachment[] | ((prev: Attachment[]) => Attachment[]),
  ) => void;
  setSearchQuery: (query: string) => void;
  setMessageSearch: (search: string) => void;
  setRegeneratingId: (id: string | null) => void;
  setCopiedId: (id: string | null) => void;

  // Actions to manipulate chats more easily
  addMessage: (chatId: string, message: ChatMessage) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updater: Partial<ChatMessage>,
  ) => void;
  createChat: () => string;
  deleteChat: (chatId: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, _get) => ({
      chats: {},
      currentChatId: "",
      attachments: [],
      searchQuery: "",
      messageSearch: "",
      regeneratingId: null,
      copiedId: null,

      setChats: (updater) =>
        set((state) => ({
          chats:
            typeof updater === "function"
              ? (updater as any)(state.chats)
              : updater,
        })),
      setCurrentChatId: (id) => set({ currentChatId: id }),
      setAttachments: (updater) =>
        set((state) => ({
          attachments:
            typeof updater === "function"
              ? (updater as any)(state.attachments)
              : updater,
        })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setMessageSearch: (search) => set({ messageSearch: search }),
      setRegeneratingId: (id) => set({ regeneratingId: id }),
      setCopiedId: (id) => set({ copiedId: id }),

      addMessage: (chatId, message) =>
        set((state) => {
          const currentMessages = state.chats[chatId] || [];
          return {
            chats: {
              ...state.chats,
              [chatId]: [...currentMessages, message],
            },
          };
        }),

      updateMessage: (chatId, messageId, updater) =>
        set((state) => {
          const messages = state.chats[chatId];
          if (!messages) return {};
          const newMessages = messages.map((m) =>
            m.id === messageId ? { ...m, ...updater } : m,
          );
          return {
            chats: {
              ...state.chats,
              [chatId]: newMessages,
            },
          };
        }),

      createChat: () => {
        const id = Date.now().toString();
        set((state) => ({
          chats: { ...state.chats, [id]: [] },
          currentChatId: id,
        }));
        return id;
      },

      deleteChat: (chatId) => {
        // Fire and forget server deletion
        fetch(`/api/persistence/chats/${chatId}`, { method: "DELETE" }).catch(
          () => null,
        );

        set((state) => {
          const newChats = { ...state.chats };
          delete newChats[chatId];

          // If we deleted the current chat, switch to another one
          let nextId = state.currentChatId;
          if (state.currentChatId === chatId) {
            const ids = Object.keys(newChats).sort().reverse();
            nextId = ids[0] || "";
            if (!nextId) {
              // Create new one if empty
              nextId = Date.now().toString();
              newChats[nextId] = [];
            }
          }
          return { chats: newChats, currentChatId: nextId };
        });
      },
    }),
    {
      name: "superkagi-chats",
      partialize: (state) => ({
        chats: state.chats,
        currentChatId: state.currentChatId,
      }),
    },
  ),
);
