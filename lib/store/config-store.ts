import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  fallbackDefaults,
  initialConfig,
  mergeEnvDefaults,
} from "@/lib/config-utils";
import type { ServerDefaults, UiConfig } from "@/types/chat";

interface ConfigState {
  config: UiConfig;
  serverDefaults: typeof fallbackDefaults | ServerDefaults;
  hydrated: boolean;
  persistLoaded: boolean;
  providerError: string | null;

  setConfig: (
    updater:
      | UiConfig
      | Partial<UiConfig>
      | ((prev: UiConfig) => UiConfig | Partial<UiConfig>),
  ) => void;
  setServerDefaults: (
    defaults: typeof fallbackDefaults | ServerDefaults,
  ) => void;
  setHydrated: (hydrated: boolean) => void;
  setPersistLoaded: (loaded: boolean) => void;
  setProviderError: (error: string | null) => void;
  mergeConfig: (
    newConfig: UiConfig,
    serverDefaults: typeof fallbackDefaults,
  ) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, _get) => ({
      config: initialConfig,
      serverDefaults: fallbackDefaults,
      hydrated: false,
      persistLoaded: false,
      providerError: null,

      setConfig: (updater) =>
        set((state) => {
          const next =
            typeof updater === "function"
              ? (updater as any)(state.config)
              : updater;
          const newConfig = { ...state.config, ...next };
          return { config: newConfig };
        }),

      setServerDefaults: (defaults) =>
        set((_state) => {
          // Re-merge config when defaults change?
          // Similar to page.tsx logic: setConfig((prev) => mergeEnvDefaults(prev, prev, data));
          // But we typically do this in component effect.
          // Let's just set it here.
          return { serverDefaults: defaults };
        }),

      mergeConfig: (newConfig, serverDefs) =>
        set((state) => ({
          config: mergeEnvDefaults(state.config, newConfig, serverDefs),
        })),

      setHydrated: (hydrated) => set({ hydrated }),
      setPersistLoaded: (loaded) => set({ persistLoaded: loaded }),
      setProviderError: (error) => set({ providerError: error }),
    }),
    {
      name: "superkagi-config", // This matches standard persist naming often used
      // We don't want to persist everything.
      // Actually page.tsx persists 'config' to localStorage key 'config'.
      // zustand persist uses one key for the whole store.
      // We can use partialize to only persist 'config'.
      partialize: (state) => ({ config: state.config }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
