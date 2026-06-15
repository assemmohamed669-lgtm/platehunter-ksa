"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "green" | "oled";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "green",
  toggleTheme: () => {},
});

const STORAGE_KEY = "pk_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("green");

  // Read the saved preference once on mount.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === "oled" || saved === "green") {
      setTheme(saved);
    }
  }, []);

  // Reflect the theme on <html> so global CSS can swap background colors,
  // and persist the choice.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "oled") {
      root.classList.add("oled");
    } else {
      root.classList.remove("oled");
    }
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "oled" ? "green" : "oled"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
