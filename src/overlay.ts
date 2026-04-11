// ────────────────────────────────────────────
// Per-window overlay infrastructure
// ────────────────────────────────────────────
//
// Performance:
//  - Overlay elements pooled per window, reused after animation completes
//  - Single stylesheet per window for base styles only

const CLASS_PREFIX = "__rdu";

const injectedWindows = new WeakSet<Window>();

function ensureStylesheet(win: Window) {
  if (injectedWindows.has(win)) return;
  injectedWindows.add(win);

  const style = win.document.createElement("style");
  style.textContent = `
    .${CLASS_PREFIX}-box {
      position: fixed;
      pointer-events: none;
      box-sizing: border-box;
      border-radius: 3px;
      opacity: 0;
      will-change: opacity;
    }
    .${CLASS_PREFIX}-label {
      position: absolute;
      top: -18px;
      left: -1px;
      font: 10px/16px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      padding: 0 4px;
      color: #fff;
      border-radius: 2px 2px 0 0;
      white-space: nowrap;
      pointer-events: none;
    }
  `;
  win.document.head.appendChild(style);
}

// ────────────────────────────────────────────
// Overlay root container
// ────────────────────────────────────────────

const overlayRoots = new WeakMap<Window, HTMLDivElement>();

function getOverlayRoot(win: Window): HTMLDivElement | null {
  if (win.closed) return null;

  const existing = overlayRoots.get(win);
  if (existing?.isConnected) return existing;

  ensureStylesheet(win);

  const root = win.document.createElement("div");
  root.id = "__react-debug-updates";
  Object.assign(root.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "0",
    height: "0",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "2147483647",
  } satisfies Partial<CSSStyleDeclaration>);
  win.document.body.appendChild(root);

  overlayRoots.set(win, root);
  return root;
}

// ────────────────────────────────────────────
// Element pool
// ────────────────────────────────────────────

const pools = new WeakMap<Window, HTMLDivElement[]>();

export function acquireOverlay(win: Window): HTMLDivElement | null {
  const root = getOverlayRoot(win);
  if (!root) return null;

  let pool = pools.get(win);
  if (!pool) {
    pool = [];
    pools.set(win, pool);
  }

  const document = win.document;
  let element = pool.pop();

  if (!element) {
    element = document.createElement("div");
    element.className = `${CLASS_PREFIX}-box`;

    const label = document.createElement("span");
    label.className = `${CLASS_PREFIX}-label`;
    element.appendChild(label);
  }

  root.appendChild(element);
  return element;
}

/** Remove an overlay from the DOM and return it to the pool. */
export function releaseOverlay(win: Window, element: HTMLDivElement) {
  element.remove();
  const pool = pools.get(win);
  pool?.push(element);
}

export function disposeAllOverlays() {
  const mainRoot = overlayRoots.get(window);
  mainRoot?.remove();
  overlayRoots.delete(window);
  pools.delete(window);
}
