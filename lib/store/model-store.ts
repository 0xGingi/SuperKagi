import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  normalizeNanoImageModels,
  normalizeNanoModels,
  normalizeOpenrouterModels,
} from "@/lib/model-utils";
import type { ImageModelOption, ModelOption } from "@/types/chat";
import { useConfigStore } from "./config-store";

interface ModelState {
  nanoModels: ModelOption[];
  nanoModelsStatus: string;
  nanoModelScope: "subscription" | "paid";
  nanoModelsLoading: boolean;
  nanoModelsFetchedAt: number | null;

  openrouterModels: ModelOption[];
  openrouterModelsStatus: string;
  openrouterModelsLoading: boolean;
  openrouterModelsFetchedAt: number | null;

  nanoImageModels: ImageModelOption[];
  nanoImageModelsStatus: string;
  nanoImageModelScope: "subscription" | "paid";
  nanoImageModelsLoading: boolean;
  nanoImageModelsFetchedAt: number | null;

  setNanoModels: (models: ModelOption[]) => void;
  setNanoModelsStatus: (status: string) => void;
  setNanoModelScope: (scope: "subscription" | "paid") => void;
  setNanoModelsLoading: (loading: boolean) => void;
  setNanoModelsFetchedAt: (at: number | null) => void;

  setOpenrouterModels: (models: ModelOption[]) => void;
  setOpenrouterModelsStatus: (status: string) => void;
  setOpenrouterModelsLoading: (loading: boolean) => void;
  setOpenrouterModelsFetchedAt: (at: number | null) => void;

  setNanoImageModels: (models: ImageModelOption[]) => void;
  setNanoImageModelsStatus: (status: string) => void;
  setNanoImageModelScope: (scope: "subscription" | "paid") => void;
  setNanoImageModelsLoading: (loading: boolean) => void;
  setNanoImageModelsFetchedAt: (at: number | null) => void;

  fetchNanoModels: () => Promise<void>;
  fetchOpenrouterModels: () => Promise<void>;
  fetchNanoImageModels: () => Promise<void>;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      nanoModels: [],
      nanoModelsStatus: "",
      nanoModelScope: "subscription",
      nanoModelsLoading: false,
      nanoModelsFetchedAt: null,

      openrouterModels: [],
      openrouterModelsStatus: "",
      openrouterModelsLoading: false,
      openrouterModelsFetchedAt: null,

      nanoImageModels: [],
      nanoImageModelsStatus: "",
      nanoImageModelScope: "subscription",
      nanoImageModelsLoading: false,
      nanoImageModelsFetchedAt: null,

      setNanoModels: (models) => set({ nanoModels: models }),
      setNanoModelsStatus: (status) => set({ nanoModelsStatus: status }),
      setNanoModelScope: (scope) => set({ nanoModelScope: scope }),
      setNanoModelsLoading: (loading) => set({ nanoModelsLoading: loading }),
      setNanoModelsFetchedAt: (at) => set({ nanoModelsFetchedAt: at }),

      setOpenrouterModels: (models) => set({ openrouterModels: models }),
      setOpenrouterModelsStatus: (status) =>
        set({ openrouterModelsStatus: status }),
      setOpenrouterModelsLoading: (loading) =>
        set({ openrouterModelsLoading: loading }),
      setOpenrouterModelsFetchedAt: (at) =>
        set({ openrouterModelsFetchedAt: at }),

      setNanoImageModels: (models) => set({ nanoImageModels: models }),
      setNanoImageModelsStatus: (status) =>
        set({ nanoImageModelsStatus: status }),
      setNanoImageModelScope: (scope) => set({ nanoImageModelScope: scope }),
      setNanoImageModelsLoading: (loading) =>
        set({ nanoImageModelsLoading: loading }),
      setNanoImageModelsFetchedAt: (at) =>
        set({ nanoImageModelsFetchedAt: at }),

      fetchNanoModels: async () => {
        const { config, serverDefaults } = useConfigStore.getState();
        const apiKey = config.apiKeyNanogpt;
        // Check if there's a client-side key OR server has a key configured
        if (!apiKey && !serverDefaults.hasNanoApiKey) {
          set({ nanoModelsStatus: "Add a NanoGPT API key first." });
          return;
        }
        set({ nanoModelsLoading: true });
        const scope = get().nanoModelScope;
        set({
          nanoModelsStatus:
            scope === "paid"
              ? "Fetching paid NanoGPT models…"
              : "Fetching NanoGPT subscription models…",
        });

        try {
          const res = await fetch("/api/nanogpt/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              detailed: true,
              scope,
              apiKey,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            set({
              nanoModels: [],
              nanoModelsStatus:
                data.error ||
                data.message ||
                `Error ${res.status}: ${res.statusText}`,
            });
            return;
          }
          const normalized = normalizeNanoModels(data.models);
          set({
            nanoModels: normalized,
            nanoModelsFetchedAt: Date.now(),
            nanoModelsStatus: normalized.length
              ? `Loaded ${normalized.length} ${scope === "paid" ? "paid" : "subscription"
              } models.`
              : scope === "paid"
                ? "No models returned. Check NanoGPT API key."
                : "No models returned. Check subscription/API key.",
          });
        } catch (error: any) {
          set({
            nanoModels: [],
            nanoModelsStatus: `Failed: ${error.message}`,
          });
        } finally {
          set({ nanoModelsLoading: false });
        }
      },

      fetchOpenrouterModels: async () => {
        const { config } = useConfigStore.getState();
        const apiKey = config.apiKeyOpenrouter;
        if (!apiKey) {
          set({
            openrouterModelsStatus: "Add an OpenRouter API key first.",
          });
          return;
        }
        set({
          openrouterModelsLoading: true,
          openrouterModelsStatus: "Fetching OpenRouter models…",
        });
        try {
          const res = await fetch("/api/openrouter/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey }),
          });
          const data = await res.json();
          if (!res.ok) {
            set({
              openrouterModels: [],
              openrouterModelsStatus:
                data.error ||
                data.message ||
                `Error ${res.status}: ${res.statusText}`,
            });
            return;
          }
          const normalized = normalizeOpenrouterModels(data.models);
          set({
            openrouterModels: normalized,
            openrouterModelsFetchedAt: Date.now(),
            openrouterModelsStatus: normalized.length
              ? `Loaded ${normalized.length} models.`
              : "No models returned. Check API key.",
          });
        } catch (error: any) {
          set({
            openrouterModels: [],
            openrouterModelsStatus: `Failed: ${error.message}`,
          });
        } finally {
          set({ openrouterModelsLoading: false });
        }
      },

      fetchNanoImageModels: async () => {
        const { config, serverDefaults } = useConfigStore.getState();
        const apiKey = config.apiKeyNanogpt;
        // Note: Original logic checked: if (!key && nanoImageModelScope === "subscription")
        // But generic check !key is safer/simpler to start with, or we can match logic.
        // Matching logic:
        const scope = get().nanoImageModelScope;
        // Check if there's a client-side key OR server has a key configured
        if (!apiKey && !serverDefaults.hasNanoApiKey && scope === "subscription") {
          set({ nanoImageModelsStatus: "Add a NanoGPT API key first." });
          return;
        }
        set({ nanoImageModelsLoading: true });

        set({
          nanoImageModelsStatus:
            scope === "paid"
              ? "Fetching paid NanoGPT image models…"
              : "Fetching NanoGPT subscription image models…",
        });

        try {
          const res = await fetch("/api/nanogpt/image-models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              detailed: true,
              scope,
              apiKey,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            set({
              nanoImageModels: [],
              nanoImageModelsStatus:
                data.error ||
                data.message ||
                `Error ${res.status}: ${res.statusText}`,
            });
            return;
          }

          const normalized = normalizeNanoImageModels(data.models, scope);
          set({
            nanoImageModels: normalized,
            nanoImageModelsFetchedAt: Date.now(),
            nanoImageModelsStatus: normalized.length
              ? `Loaded ${normalized.length} ${scope === "paid" ? "paid" : "subscription"
              } image models.`
              : scope === "paid"
                ? "No image models returned. Check NanoGPT API key."
                : "No image models returned. Check subscription/API key.",
          });
        } catch (error: any) {
          set({
            nanoImageModels: [],
            nanoImageModelsStatus: `Failed: ${error.message}`,
          });
        } finally {
          set({ nanoImageModelsLoading: false });
        }
      },
    }),
    {
      name: "model-storage",
      partialize: (state) => ({
        nanoModels: state.nanoModels,
        nanoModelsFetchedAt: state.nanoModelsFetchedAt,
        openrouterModels: state.openrouterModels,
        openrouterModelsFetchedAt: state.openrouterModelsFetchedAt,
        nanoImageModels: state.nanoImageModels,
        nanoImageModelsFetchedAt: state.nanoImageModelsFetchedAt,
        // We typically persist fetchedAt and models so we don't refetch on reload
      }),
    },
  ),
);
