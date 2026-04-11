import type {
  DevToolsHook,
  FiberRoot,
  HighlightEntry,
  MonitorOptions,
  RenderEntry,
  UpdateMonitor,
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
 * Start monitoring React re-renders.
 *
 * Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` to intercept
 * every React commit. Records re-render entries, optionally logs them to the
 * console, and optionally shows visual highlight overlays on re-rendered DOM nodes.
 *
 * Call this **before** React renders anything — ideally at the very top of
 * your entry point.
 *
 * Returns an `UpdateMonitor` handle, or `null` if the DevTools hook is not found.
 */
export function monitor(options: MonitorOptions = {}): UpdateMonitor | null {
  const {
    silent = false,
    bufferSize = 500,
    filter,
    overlay = true,
    mode = "self-triggered",
    showCauses = false,
    flushInterval = 250,
    animationDuration = 1200,
    showLabels = true,
    opacity = 0.3,
  } = options;

  const hook = (
    window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevToolsHook }
  ).__REACT_DEVTOOLS_GLOBAL_HOOK__;

  if (!hook) {
    console.warn(
      "[react-debug-updates] __REACT_DEVTOOLS_GLOBAL_HOOK__ not found. " +
        "Make sure React DevTools or a dev build of React is active.",
    );
    return null;
  }

  const highlighter = overlay
    ? createHighlighter({ flushInterval, animationDuration, showLabels, opacity })
    : null;

  const entries: RenderEntry[] = [];
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

      const highlightEntry: HighlightEntry = {
        component: name,
        path: getFiberPath(fiber),
        duration: fiber.actualDuration ?? 0,
        depth,
        domNode: findNearestDOMNode(fiber),
        causes: showCauses ? detectCauses(fiber) : [],
      };

      const renderEntry: RenderEntry = {
        component: highlightEntry.component,
        path: highlightEntry.path,
        duration: highlightEntry.duration,
        timestamp: performance.now(),
        causes: highlightEntry.causes,
      };

      if (filter && !filter(renderEntry)) continue;

      if (entries.length >= bufferSize) entries.shift();
      entries.push(renderEntry);

      highlightEntries.push(highlightEntry);
      highlighter?.push(highlightEntry);
    }

    // 3. Console output
    if (!silent) {
      logRerendersToConsole(highlightEntries, showCauses);
    }
  };

  const stop = () => {
    hook.onCommitFiberRoot = previousOnCommit;
    highlighter?.dispose();
    disposeAllOverlays();
  };

  if (!silent) {
    console.log(
      "%c⚛ react-debug-updates attached",
      "color: #61dafb; font-weight: bold",
    );
  }

  return { entries, stop };
}
