import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";

// Commons is light-only. Dark mode was removed; this provider simply pins the
// document to the light palette so the tokens under [data-theme="light"] apply.
const ThemeContext = createContext<{ theme: "light" }>({ theme: "light" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  return <ThemeContext.Provider value={{ theme: "light" }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
