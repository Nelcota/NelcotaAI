/** Captures the active checkout generation so completed async work cannot alter a later attempt. */
export function createCheckoutScope() {
  let generation = 0;
  return {
    invalidate() {
      generation += 1;
    },
    capture() {
      const captured = generation;
      return () => captured === generation;
    },
  };
}
