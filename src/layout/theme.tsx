import { ThemeProvider as NextThemeProvider, useTheme as useNextTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";

/** Provides the saved theme, system preference and the initial paint script. */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="dark" storageKey="nelcota-ai-theme">
      {children}
    </NextThemeProvider>
  );
}

/** Keeps theme-dependent controls consistent between SSR and the first client render. */
export function useTheme() {
  const theme = useNextTheme();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const resolvedTheme: "light" | "dark" =
    isMounted && theme.resolvedTheme === "light" ? "light" : "dark";
  return { ...theme, resolvedTheme };
}
