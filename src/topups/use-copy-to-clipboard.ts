import { useEffect, useRef, useState } from "react";

// How long the button shows "copied" before going back to "copy".
const COPIED_FEEDBACK_IN_MS = 2500;

/**
 * Copies text to the clipboard and keeps a short-lived "copied" flag for the button's feedback.
 *
 * @returns `isCopied`, true for a moment after a successful copy, and `copy`, which resolves to
 * false (after logging) when the browser refused the clipboard write, so the caller can tell
 * the user what to do instead.
 */
export function useCopyToClipboard(): {
  readonly isCopied: boolean;
  readonly copy: (text: string) => Promise<boolean>;
} {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current != null) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("clipboard write failed", error);
      return false;
    }
    setIsCopied(true);
    if (resetTimer.current != null) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_IN_MS);
    return true;
  }

  return { isCopied, copy };
}
