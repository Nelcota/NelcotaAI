import { Toaster } from "@/components/ui/sonner";

import { useTheme } from "./theme";

/** Toast container that follows the current theme. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme} position="top-center" />;
}
