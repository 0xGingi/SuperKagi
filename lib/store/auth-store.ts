"use client";

import { create } from "zustand";

export type AuthUser = {
    id: string;
    username: string;
    isAdmin: boolean;
};

interface AuthState {
    user: AuthUser | null;
    loading: boolean;
    initialized: boolean;

    setUser: (user: AuthUser | null) => void;
    setLoading: (loading: boolean) => void;
    checkSession: () => Promise<AuthUser | null>;
    login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
    user: null,
    loading: true,
    initialized: false,

    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),

    checkSession: async () => {
        set({ loading: true });
        try {
            const res = await fetch("/api/auth/session");
            const data = await res.json();
            const user = data.user || null;
            set({ user, loading: false, initialized: true });
            return user;
        } catch {
            set({ user: null, loading: false, initialized: true });
            return null;
        }
    },

    login: async (username: string, password: string) => {
        set({ loading: true });
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (res.ok && data.user) {
                set({ user: data.user, loading: false });
                return { ok: true };
            }
            set({ loading: false });
            return { ok: false, error: data.error || "Login failed" };
        } catch (error) {
            set({ loading: false });
            return { ok: false, error: (error as Error).message };
        }
    },

    logout: async () => {
        set({ loading: true });
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {
            // Continue anyway
        }
        set({ user: null, loading: false });
        // Clear all app localStorage to prevent data leaking between users
        if (typeof window !== "undefined") {
            const keysToRemove = [
                "superkagi-ui",
                "superkagi-chats",
                "superkagi-config",
                "model-storage",
                "image-gallery-storage",
                "currentChatId",
                "config",
                "chats",
                "showReasoning",
                "sidebarCollapsed",
            ];
            keysToRemove.forEach((key) => {
                try {
                    localStorage.removeItem(key);
                } catch { }
            });
            // Force page reload to clear Zustand hydrated state
            window.location.href = "/login";
        }
    },
}));
