import { useEffect, useState } from "react";

/**
 * The current time, updated every interval while the component is mounted.
 *
 * @param intervalInMs - How often to update.
 * @returns Milliseconds since the epoch.
 */
export function useNow(intervalInMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalInMs);
    return () => clearInterval(timer);
  }, [intervalInMs]);

  return now;
}
