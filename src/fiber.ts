import type { Fiber, PendingEntry } from "./types.js";
import { detectCauses } from "./causes.js";

// ────────────────────────────────────────────
// Fiber tag constants
// ────────────────────────────────────────────

export const FiberTag = {
  FunctionComponent: 0,
  ClassComponent: 1,
  HostComponent: 5,
  ForwardRef: 11,
  SimpleMemoComponent: 15,
  MemoComponent: 14,
} as const;

const COMPONENT_TAGS = new Set<number>([
  FiberTag.FunctionComponent,
  FiberTag.ClassComponent,
  FiberTag.ForwardRef,
  FiberTag.SimpleMemoComponent,
  // MemoComponent (14) is intentionally excluded — it's the memo() wrapper fiber,
  // which can have PerformedWork set during the props comparison even when the
  // inner component bailed out and didn't actually re-render.
]);

const PerformedWork = 0b0000001;

// ────────────────────────────────────────────
// Fiber tree helpers
// ────────────────────────────────────────────

export function getComponentName(fiber: Fiber): string | null {
  const { type } = fiber;
  if (!type || typeof type === "string") return null;
  return type.displayName ?? type.name ?? null;
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as HTMLElement).getBoundingClientRect === "function"
  );
}

export function findNearestDOMNode(fiber: Fiber): HTMLElement | null {
  if (fiber.tag === FiberTag.HostComponent && isHTMLElement(fiber.stateNode)) {
    return fiber.stateNode;
  }
  let child: Fiber | null = fiber.child;
  while (child) {
    const found = findNearestDOMNode(child);
    if (found) return found;
    child = child.sibling;
  }
  return null;
}

export function getFiberPath(fiber: Fiber, maxDepth = 5): string {
  const parts: string[] = [];
  let current: Fiber | null = fiber.return;
  let depth = 0;
  while (current && depth < maxDepth) {
    const name = getComponentName(current);
    if (name) parts.unshift(name);
    current = current.return;
    depth++;
  }
  return parts.length ? parts.join(" → ") : "(root)";
}

// ────────────────────────────────────────────
// Self-triggered detection
// ────────────────────────────────────────────

function isSelfTriggered(fiber: Fiber): boolean {
  const alternate = fiber.alternate;
  if (!alternate) return false;
  return fiber.memoizedProps === alternate.memoizedProps;
}

// ────────────────────────────────────────────
// Collector with commit tracking
// ────────────────────────────────────────────
//
// React double-buffers fibers: on each commit the work-in-progress tree becomes
// the current tree. Fibers that were actually rendered are *new* objects (recycled
// from their alternates). Fibers that were skipped (bailed out or in an unrelated
// subtree) are the *same* objects as the previous current tree.
//
// We exploit this: by remembering which fiber objects were current last commit,
// we can tell whether a fiber was actually processed — if the object identity
// changed, it was rendered; if it's the same object, its PerformedWork flag is
// stale from a prior commit and should be ignored.

export function createCollector() {
  let previousCommitFibers = new WeakSet<Fiber>();

  return function collectPending(
    root: Fiber,
    mode: "self-triggered" | "all",
    trackCauses: boolean,
  ): PendingEntry[] {
    const currentCommitFibers = new WeakSet<Fiber>();
    const entries: PendingEntry[] = [];
    const selfTriggeredOnly = mode === "self-triggered";

    function walk(fiber: Fiber, depth: number) {
      const isComponent = COMPONENT_TAGS.has(fiber.tag);

      // Track all component fibers so we can detect stale ones next commit
      if (isComponent) {
        currentCommitFibers.add(fiber);
      }

      if (
        isComponent &&
        fiber.flags & PerformedWork &&
        fiber.alternate !== null &&
        !previousCommitFibers.has(fiber) && // same object as last commit → stale
        (!selfTriggeredOnly || isSelfTriggered(fiber))
      ) {
        const name = getComponentName(fiber);
        if (name) {
          entries.push({
            component: name,
            path: getFiberPath(fiber),
            duration: fiber.actualDuration ?? 0,
            depth,
            domNode: findNearestDOMNode(fiber),
            causes: trackCauses ? detectCauses(fiber) : [],
          });
        }
      }
      if (fiber.child) walk(fiber.child, depth + 1);
      if (fiber.sibling) walk(fiber.sibling, depth);
    }

    walk(root, 0);
    previousCommitFibers = currentCommitFibers;
    return entries;
  };
}
