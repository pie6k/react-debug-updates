// ────────────────────────────────────────────
// React internals (fiber tree)
// ────────────────────────────────────────────

export interface Fiber {
  tag: number;
  type: FiberType | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: unknown;
  actualDuration?: number;
  _debugHookTypes?: string[] | null;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  flags: number;
  stateNode: unknown;
}

export type FiberType = string | { displayName?: string; name?: string };

export interface FiberRoot {
  current: Fiber;
}

export interface DevToolsHook {
  onCommitFiberRoot: (
    rendererID: number,
    root: FiberRoot,
    priorityLevel?: unknown,
  ) => void;
  [key: string]: unknown;
}

/** A node in React's internal hook linked list. */
export interface HookNode {
  memoizedState: unknown;
  next: HookNode | null;
}

// ────────────────────────────────────────────
// Update cause
// ────────────────────────────────────────────

export interface UpdateCause {
  kind: "hook" | "props" | "class-state" | "unknown";
  /** Source-order index of the hook (0-based). */
  hookIndex?: number;
  /** Hook type from _debugHookTypes, e.g. "useState", "useReducer". */
  hookType?: string;
  previousValue?: unknown;
  nextValue?: unknown;
}

// ────────────────────────────────────────────
// Detected render (output of fiber tree analysis)
// ────────────────────────────────────────────

/** A component fiber that was detected as re-rendered during a commit. */
export interface DetectedRender {
  fiber: Fiber;
  depth: number;
}

// ────────────────────────────────────────────
// Highlight entry (ready for overlay / console)
// ────────────────────────────────────────────

export interface HighlightEntry {
  component: string;
  path: string;
  duration: number;
  depth: number;
  domNode: HTMLElement | null;
  causes: UpdateCause[];
}

// ────────────────────────────────────────────
// Overlay config (internal, all required)
// ────────────────────────────────────────────

export interface OverlayConfig {
  flushInterval: number;
  animationDuration: number;
  showLabels: boolean;
  opacity: number;
}

// ────────────────────────────────────────────
// Public API types
// ────────────────────────────────────────────

export interface RenderEntry {
  component: string;
  path: string;
  duration: number;
  timestamp: number;
  causes: UpdateCause[];
}

export interface MonitorOptions {
  /** Suppress console output. Default: false */
  silent?: boolean;
  /**
   * Which re-renders to track.
   *  - `"self-triggered"` — only components whose own state/hooks changed
   *  - `"all"` — every component that re-rendered, including children swept by a parent update
   *
   * Default: `"self-triggered"`
   */
  mode?: "self-triggered" | "all";
  /** Ring buffer size for stored entries. Default: 500 */
  bufferSize?: number;
  /** Filter — return `false` to skip an entry. */
  filter?: (entry: RenderEntry) => boolean;
  /**
   * Detect and display *why* each component re-rendered.
   *
   * Shows which hook (useState[2], useContext, etc.) triggered the update,
   * with previous→next values for state hooks.
   * Requires a React dev build (`_debugHookTypes`). Default: `false`
   */
  showCauses?: boolean;

  // ── Overlay options ──

  /** Enable visual highlight overlays. Default: true */
  overlay?: boolean;
  /** Show text labels (component name, count, duration, cause) above overlays. Default: true */
  showLabels?: boolean;
  /** Peak opacity of overlay highlights (0–1). Default: 0.3 */
  opacity?: number;
  /** Time between overlay flush cycles (ms). Default: 250 */
  flushInterval?: number;
  /** Overlay fade-out animation duration (ms). Default: 1200 */
  animationDuration?: number;
}

export interface UpdateMonitor {
  /** Ring buffer of recorded re-render entries. */
  entries: RenderEntry[];
  /** Unhook from React and clean up overlays. */
  stop: () => void;
}
