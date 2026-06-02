import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// TODO (your contribution): This function runs once on page load to pick the starting theme.
// The current implementation reads localStorage first, then falls back to "system".
// You could change the fallback to "light" if you prefer a guaranteed light default for new users,
// or keep "system" to respect the user's OS dark-mode preference automatically.
// The trade-off: "system" is more respectful of OS settings; "light" is more predictable for brand demos.
function getInitialTheme(): Theme {
  const saved = localStorage.getItem("urjascan-theme") as Theme | null;
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  // No saved preference — follow the OS
  return "system";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const resolved = resolveTheme(theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  // Re-resolve when the OS preference changes (only matters when theme === "system")
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setThemeState(t => (t === "system" ? "system" : t));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("urjascan-theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
