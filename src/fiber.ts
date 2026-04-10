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
  FiberTag.MemoComponent,
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
// Collect pending entries from a fiber tree
// ────────────────────────────────────────────

export function collectPending(
  root: Fiber,
  mode: "self-triggered" | "all",
  trackCauses: boolean,
): PendingEntry[] {
  const entries: PendingEntry[] = [];
  const selfTriggeredOnly = mode === "self-triggered";

  function walk(fiber: Fiber) {
    if (
      COMPONENT_TAGS.has(fiber.tag) &&
      fiber.flags & PerformedWork &&
      fiber.alternate !== null &&
      (!selfTriggeredOnly || isSelfTriggered(fiber))
    ) {
      const name = getComponentName(fiber);
      if (name) {
        entries.push({
          component: name,
          path: getFiberPath(fiber),
          duration: fiber.actualDuration ?? 0,
          domNode: findNearestDOMNode(fiber),
          causes: trackCauses ? detectCauses(fiber) : [],
        });
      }
    }
    if (fiber.child) walk(fiber.child);
    if (fiber.sibling) walk(fiber.sibling);
  }

  walk(root);
  return entries;
}
