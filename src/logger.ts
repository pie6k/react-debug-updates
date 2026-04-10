import type {
  DevToolsHook,
  FiberRoot,
  LoggerOptions,
  RenderEntry,
  RenderLogger,
} from "./types.js";
import { createCollector } from "./fiber.js";
import { formatCausesConsole } from "./format.js";
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
  const collectPending = createCollector();

  const entries: RenderEntry[] = [];
  const previousOnCommit = hook.onCommitFiberRoot.bind(hook);

  hook.onCommitFiberRoot = (
    rendererID: number,
    root: FiberRoot,
    priorityLevel?: unknown,
  ) => {
    previousOnCommit(rendererID, root, priorityLevel);

    const pendingEntries = collectPending(root.current, mode, showCauses);

    for (let i = 0; i < pendingEntries.length; i++) {
      const pendingEntry = pendingEntries[i];

      const entry: RenderEntry = {
        component: pendingEntry.component,
        path: pendingEntry.path,
        duration: pendingEntry.duration,
        timestamp: performance.now(),
        causes: pendingEntry.causes,
      };

      if (filter && !filter(entry)) continue;

      if (entries.length >= bufferSize) entries.shift();
      entries.push(entry);

      batcher?.push(pendingEntry);
    }

    // Console output
    if (!silent && pendingEntries.length > 0) {
      console.groupCollapsed(
        `%c⚛ ${pendingEntries.length} re-render${pendingEntries.length > 1 ? "s" : ""}`,
        "color: #61dafb; font-weight: bold",
      );

      for (let i = 0; i < pendingEntries.length; i++) {
        const pendingEntry = pendingEntries[i];
        const durationText =
          pendingEntry.duration > 0
            ? ` (${pendingEntry.duration.toFixed(2)}ms)`
            : "";
        console.log(
          `%c${pendingEntry.component}%c ${pendingEntry.path}${durationText}`,
          "color: #e8e82e; font-weight: bold",
          "color: #888",
        );

        if (showCauses && pendingEntry.causes.length > 0) {
          const lines = formatCausesConsole(pendingEntry.causes);
          for (const line of lines) {
            console.log(`%c${line}`, "color: #aaa");
          }
        }
      }

      console.groupEnd();
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
