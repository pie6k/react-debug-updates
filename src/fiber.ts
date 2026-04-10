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

// Component tags we report as re-renders.
// MemoComponent (14) is excluded to avoid double-reporting — it's a wrapper
// fiber around the inner component. The inner component (FunctionComponent,
// ForwardRef, or SimpleMemoComponent) has its own PerformedWork flag and
// will be reported correctly on its own.
const COMPONENT_TAGS = new Set<number>([
  FiberTag.FunctionComponent,
  FiberTag.ClassComponent,
  FiberTag.ForwardRef,
  FiberTag.SimpleMemoComponent,
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
// didFiberRender — mirrors React DevTools
// ────────────────────────────────────────────
//
// See: react-devtools-shared/src/backend/fiber/shared/DevToolsFiberChangeDetection.js
//
// For component fibers (function, class, memo, forwardRef), React sets the
// PerformedWork flag (bit 0) only when user code actually executes.
// createWorkInProgress resets flags to NoFlags, so PerformedWork on a
// work-in-progress fiber is always fresh — never stale from a prior commit.
//
// This check must only be called AFTER confirming prevFiber !== nextFiber
// (i.e. the fiber was actually processed, not a bailed-out subtree).

function didFiberRender(nextFiber: Fiber): boolean {
  return (nextFiber.flags & PerformedWork) === PerformedWork;
}

// ────────────────────────────────────────────
// Collect re-rendered components from a commit
// ────────────────────────────────────────────
//
// Mirrors React DevTools' updateFiberRecursively / updateChildrenRecursively.
//
// React double-buffers fibers. After a commit, root.current is the committed
// tree and root.current.alternate is the previous tree. We walk both in
// parallel. At each level, if prevChild and nextChild are the same object,
// React bailed out that entire subtree (via cloneChildFibers) — we skip it.
// Otherwise, we use nextChild.alternate as the previous fiber and check
// didFiberRender (PerformedWork) to see if user code actually ran.

export function collectPending(
  root: Fiber,
  mode: "self-triggered" | "all",
  trackCauses: boolean,
): PendingEntry[] {
  const entries: PendingEntry[] = [];
  const selfTriggeredOnly = mode === "self-triggered";

  // The alternate of the committed root is the previous tree's root.
  // On initial mount this is null — nothing to report.
  const previousRoot = root.alternate;
  if (!previousRoot) return entries;

  function walk(
    nextFiber: Fiber,
    previousFiber: Fiber | null,
    depth: number,
  ) {
    // ── Check this fiber ──
    if (
      COMPONENT_TAGS.has(nextFiber.tag) &&
      previousFiber !== null &&
      previousFiber !== nextFiber && // same object → bailed-out subtree
      didFiberRender(nextFiber) &&
      (!selfTriggeredOnly || isSelfTriggered(nextFiber))
    ) {
      const name = getComponentName(nextFiber);
      if (name) {
        entries.push({
          component: name,
          path: getFiberPath(nextFiber),
          duration: nextFiber.actualDuration ?? 0,
          depth,
          domNode: findNearestDOMNode(nextFiber),
          causes: trackCauses ? detectCauses(nextFiber) : [],
        });
      }
    }

    // ── Walk children, matching with previous tree ──
    let nextChild = nextFiber.child;
    let previousChildAtSameIndex = previousFiber?.child ?? null;

    while (nextChild) {
      let matchedPrevious: Fiber | null;

      if (previousChildAtSameIndex === nextChild) {
        // Same object identity — React shared this fiber via cloneChildFibers.
        // The entire subtree was bailed out; passing the same object as both
        // prev and next causes the prevFiber !== nextFiber guard to skip it.
        matchedPrevious = nextChild;
      } else {
        // Different object — this fiber was processed. The alternate is the
        // corresponding fiber from the previous tree.
        matchedPrevious = nextChild.alternate;
      }

      walk(nextChild, matchedPrevious, depth + 1);

      nextChild = nextChild.sibling;
      previousChildAtSameIndex = previousChildAtSameIndex?.sibling ?? null;
    }
  }

  walk(root, previousRoot, 0);
  return entries;
}
