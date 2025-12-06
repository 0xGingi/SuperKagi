"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

type ThemeState = {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  setResolvedTheme: (theme: "dark" | "light") => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      resolvedTheme: "dark",
      setTheme: (theme) => set({ theme }),
      setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
    }),
    {
      name: "superkagi-theme",
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
  [key: string]: any;
}) {
  const { theme, setResolvedTheme } = useThemeStore();

  // Initialize with default if needed, though persist handles it.
  // Actually, we might want to respect defaultTheme prop if storage is empty?
  // But persist middleware usually handles hydration.

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    let systemTheme: "dark" | "light" = "dark";
    if (theme === "system") {
      systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    const finalTheme = theme === "system" ? systemTheme : theme;
    root.classList.add(finalTheme);
    setResolvedTheme(finalTheme);
  }, [theme, setResolvedTheme]);

  // Listen for system changes if theme is system
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const newLimit = media.matches ? "dark" : "light";
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(newLimit);
      setResolvedTheme(newLimit);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, setResolvedTheme]);

  return <>{children}</>;
}

// Hook for backward compatibility
export const useTheme = () => {
  const { theme, setTheme, resolvedTheme } = useThemeStore();
  return { theme, setTheme, resolvedTheme };
};
