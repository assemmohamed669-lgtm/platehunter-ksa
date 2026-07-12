/**
 * A tiny stack of "back" interceptors. Open UI (the side menu, modals) pushes a
 * handler while it's open; the hardware back button runs the top handler first
 * (e.g. close the menu) instead of navigating away or exiting the app.
 */
type Handler = () => void;

const stack: Handler[] = [];

/** Register a handler while some overlay is open. Returns an unregister fn. */
export function pushBackHandler(fn: Handler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Runs the top handler if any. Returns true when it consumed the back press. */
export function runTopBackHandler(): boolean {
  const fn = stack[stack.length - 1];
  if (fn) { fn(); return true; }
  return false;
}
