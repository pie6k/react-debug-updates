import type { Fiber, HookNode, UpdateCause } from "./types.js";
import { FiberTag } from "./fiber.js";

// ────────────────────────────────────────────
// Update cause detection
// ────────────────────────────────────────────
//
// For function components, React stores hooks as a linked list on
// fiber.memoizedState. In dev builds, _debugHookTypes lists hook names
// in call order. We walk both in parallel, comparing memoizedState
// on each node to find which hook's state actually changed.
//
// Caveat: useContext does NOT create a linked list node, so we skip it
// when advancing the pointer, and detect it by elimination.

/**
 * Hooks whose memoizedState changing can trigger a re-render.
 * We only report these — useEffect/useMemo/etc. don't cause re-renders.
 */
const STATE_HOOKS = new Set([
  "useState",
  "useReducer",
  "useSyncExternalStore",
]);

/**
 * Hooks that do NOT create a node in the memoizedState linked list.
 * Currently only useContext — every other hook allocates a node.
 */
const HOOKS_WITHOUT_NODE = new Set(["useContext"]);

export function detectCauses(fiber: Fiber): UpdateCause[] {
  const alternate = fiber.alternate;
  if (!alternate) return [];

  const causes: UpdateCause[] = [];

  // ── Props changed (parent re-rendered us with new props) ──
  if (fiber.memoizedProps !== alternate.memoizedProps) {
    causes.push({ kind: "props" });
  }

  // ── Class component ──
  if (fiber.tag === FiberTag.ClassComponent) {
    if (fiber.memoizedState !== alternate.memoizedState) {
      causes.push({ kind: "class-state" });
    }
    return causes;
  }

  // ── Function component hooks ──
  const hookTypes = fiber._debugHookTypes;

  if (!hookTypes) {
    // No debug info (prod build) — best effort
    if (fiber.memoizedState !== alternate.memoizedState) {
      causes.push({ kind: "unknown" });
    }
    return causes;
  }

  let currentNode = fiber.memoizedState as HookNode | null;
  let previousNode = alternate.memoizedState as HookNode | null;
  let hasContextHook = false;
  let anyStateHookChanged = false;

  for (let i = 0; i < hookTypes.length; i++) {
    const type = hookTypes[i];

    // useContext has no linked list node — skip pointer advance
    if (HOOKS_WITHOUT_NODE.has(type)) {
      if (type === "useContext") hasContextHook = true;
      continue;
    }

    if (STATE_HOOKS.has(type) && currentNode && previousNode) {
      if (!Object.is(currentNode.memoizedState, previousNode.memoizedState)) {
        anyStateHookChanged = true;
        causes.push({
          kind: "hook",
          hookIndex: i,
          hookType: type,
          previousValue: previousNode.memoizedState,
          nextValue: currentNode.memoizedState,
        });
      }
    }

    currentNode = currentNode?.next ?? null;
    previousNode = previousNode?.next ?? null;
  }

  // If no state hook changed but component is self-triggered and has
  // useContext → the context value must have changed.
  if (
    hasContextHook &&
    !anyStateHookChanged &&
    fiber.memoizedProps === alternate.memoizedProps
  ) {
    causes.push({ kind: "hook", hookType: "useContext" });
  }

  // If still nothing and self-triggered, mark unknown
  if (causes.length === 0 && fiber.memoizedProps === alternate.memoizedProps) {
    causes.push({ kind: "unknown" });
  }

  return causes;
}
