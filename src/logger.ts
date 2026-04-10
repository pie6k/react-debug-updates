import type {
  DevToolsHook,
  FiberRoot,
  LoggerOptions,
  PendingEntry,
  RenderEntry,
  RenderLogger,
} from "./types.js";
import {
  detectRenders,
  findNearestDOMNode,
  getComponentName,
  getFiberPath,
} from "./fiber.js";
import { detectCauses } from "./causes.js";
import { logRerendersToConsole } from "./format.js";
import { HIGHLIGHT_DEFAULTS, createBatcher } from "./batcher.js";
import { disposeAllOverlays } from "./overlay.js";

/**
 * Attach a render logger to React's DevTools hook.
 *
 * Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` to intercept
 * every React commit. Records re-render entries, optionally logs them to the
 * console, and optionally shows visual highlight overlays on re-rendered DOM nodes.
 *
 * Returns a `RenderLogger` handle, or `null` if the DevTools hook is not found.
 */
export function attachRenderLogger(
  options: LoggerOptions = {},
): RenderLogger | null {
  const {
    silent = false,
    bufferSize = 500,
    filter,
    highlight = false,
    mode = "self-triggered",
    showCauses = false,
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

  const highlightOptions = highlight
    ? {
        ...HIGHLIGHT_DEFAULTS,
        ...(typeof highlight === "object" ? highlight : {}),
      }
    : null;

  const batcher = highlightOptions ? createBatcher(highlightOptions) : null;

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
    const pendingEntries: PendingEntry[] = [];

    for (let i = 0; i < detectedRenders.length; i++) {
      const { fiber, depth } = detectedRenders[i];
      const name = getComponentName(fiber);
      if (!name) continue;

      const pendingEntry: PendingEntry = {
        component: name,
        path: getFiberPath(fiber),
        duration: fiber.actualDuration ?? 0,
        depth,
        domNode: findNearestDOMNode(fiber),
        causes: showCauses ? detectCauses(fiber) : [],
      };

      const renderEntry: RenderEntry = {
        component: pendingEntry.component,
        path: pendingEntry.path,
        duration: pendingEntry.duration,
        timestamp: performance.now(),
        causes: pendingEntry.causes,
      };

      if (filter && !filter(renderEntry)) continue;

      if (entries.length >= bufferSize) entries.shift();
      entries.push(renderEntry);

      pendingEntries.push(pendingEntry);
      batcher?.push(pendingEntry);
    }

    // 3. Console output
    if (!silent) {
      logRerendersToConsole(pendingEntries, showCauses);
    }
  };

  const disconnect = () => {
    hook.onCommitFiberRoot = previousOnCommit;
    batcher?.dispose();
    disposeAllOverlays();
  };

  if (!silent) {
    console.log(
      "%c⚛ react-debug-updates attached",
      "color: #61dafb; font-weight: bold",
    );
  }

  return { entries, disconnect };
}
