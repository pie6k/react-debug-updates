import type {
  DevToolsHook,
  FiberRoot,
  HighlightEntry,
  MonitorOptions,
} from "./types.js";
import {
  detectRenders,
  findNearestDOMNode,
  getComponentName,
  getFiberPath,
} from "./fiber.js";
import { detectCauses } from "./causes.js";
import { logRerendersToConsole } from "./format.js";
import { createHighlighter } from "./highlights.js";
import { disposeAllOverlays } from "./overlay.js";

/**
 * Ensure __REACT_DEVTOOLS_GLOBAL_HOOK__ exists on window.
 *
 * React reads this hook during initialization — if it's missing, React will
 * never connect. When this library is imported before React (the recommended
 * setup), we need to create a minimal hook so React can find and register with it.
 *
 * If a hook already exists (e.g. from the React DevTools extension), we leave
 * it untouched and hook into it.
 */
function ensureDevToolsHook(win: Window): DevToolsHook {
  const global = win as unknown as {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevToolsHook;
  };

  if (!global.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject() {
        return 1;
      },
      onCommitFiberRoot() {},
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    } as DevToolsHook;
  }

  return global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
}

/**
 * Start monitoring React re-renders.
 *
 * Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` to intercept
 * every React commit. Shows visual highlight overlays on re-rendered DOM nodes
 * and optionally logs re-renders to the console.
 *
 * Call this **before** React renders anything — ideally at the very top of
 * your entry point.
 *
 * Returns a `stop` function to unhook and clean up, or `null` if called
 * in a non-browser environment (e.g. SSR).
 */
export function startReactUpdatesMonitor({
  logToConsole = false,
  highlight = true,
  mode = "self-triggered",
  reasonOfUpdate = false,
  highlightFlushInterval = 250,
  highlightAnimationDuration = 1200,
  highlightShowLabels = true,
  highlightOpacity = 0.3,
}: MonitorOptions = {}): (() => void) | null {
  // SSR guard — nothing to do without a DOM
  if (typeof window === "undefined") return null;

  const hook = ensureDevToolsHook(window);

  const highlighter = highlight
    ? createHighlighter({
        flushInterval: highlightFlushInterval,
        animationDuration: highlightAnimationDuration,
        showLabels: highlightShowLabels,
        opacity: highlightOpacity,
      })
    : null;

  const previousOnCommit = hook.onCommitFiberRoot.bind(hook);

  hook.onCommitFiberRoot = (
    rendererID: number,
    root: FiberRoot,
    priorityLevel?: unknown,
  ) => {
    previousOnCommit(rendererID, root, priorityLevel);

    // 1. Detect which component fibers actually re-rendered (pure fiber analysis)
    const detectedRenders = detectRenders(root.current, mode);
    if (detectedRenders.length === 0) return;

    // 2. Build full entries: resolve names, DOM nodes, causes
    const highlightEntries: HighlightEntry[] = [];

    for (let i = 0; i < detectedRenders.length; i++) {
      const { fiber, depth } = detectedRenders[i];
      const name = getComponentName(fiber);
      if (!name) continue;

      const entry: HighlightEntry = {
        component: name,
        path: getFiberPath(fiber),
        duration: fiber.actualDuration ?? 0,
        depth,
        domNode: findNearestDOMNode(fiber),
        causes: reasonOfUpdate ? detectCauses(fiber) : [],
      };

      highlightEntries.push(entry);
      highlighter?.push(entry);
    }

    // 3. Console output
    if (logToConsole) {
      logRerendersToConsole(highlightEntries, reasonOfUpdate);
    }
  };

  if (logToConsole) {
    console.log(
      "%c⚛ react-debug-updates attached",
      "color: #61dafb; font-weight: bold",
    );
  }

  return () => {
    hook.onCommitFiberRoot = previousOnCommit;
    highlighter?.dispose();
    disposeAllOverlays();
  };
}
