import type { OverlayConfig, HighlightEntry } from "./types.js";
import { formatCausesShort } from "./format.js";
import { acquireOverlay, OVERLAY_ANIMATION_NAME } from "./overlay.js";

// ────────────────────────────────────────────
// Heat color
// ────────────────────────────────────────────

function heatColor(count: number, alpha: number): string {
  const normalizedCount = Math.min((count - 1) / 7, 1);
  const hue = 200 - normalizedCount * 200;
  const saturation = 85 + normalizedCount * 15;
  const lightness = 55 - normalizedCount * 10;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

// ────────────────────────────────────────────
// Highlight scheduler
// ────────────────────────────────────────────
//
// Commit path just pushes lightweight entries (no DOM reads, no formatting).
// Flush (setInterval): batched rect reads → batched DOM writes.

interface CoalescedEntry {
  count: number;
  totalDuration: number;
  component: string;
  /** Shallowest fiber depth among coalesced entries (for z-ordering). */
  depth: number;
  domNode: HTMLElement;
  ownerWindow: Window;
  causeSummary: string;
}

export function createHighlighter(config: OverlayConfig) {
  let pending: HighlightEntry[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  function flush() {
    if (pending.length === 0) return;

    const batch = pending;
    pending = [];

    // Coalesce by DOM node identity
    const map = new Map<HTMLElement, CoalescedEntry>();

    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i];
      if (!entry.domNode) continue;

      const existing = map.get(entry.domNode);
      if (existing) {
        existing.count++;
        existing.totalDuration += entry.duration;
        existing.depth = Math.min(existing.depth, entry.depth);
      } else {
        const win = entry.domNode.ownerDocument?.defaultView;
        if (!win || win.closed) continue;
        map.set(entry.domNode, {
          count: 1,
          totalDuration: entry.duration,
          component: entry.component,
          depth: entry.depth,
          domNode: entry.domNode,
          ownerWindow: win,
          causeSummary: formatCausesShort(entry.causes),
        });
      }
    }

    // Read phase: batch all rect reads
    const toShow: Array<{ coalesced: CoalescedEntry; rect: DOMRect }> = [];
    for (const coalesced of map.values()) {
      const rect = coalesced.domNode.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        toShow.push({ coalesced, rect });
      }
    }

    // Sort deepest first so parents are appended last (render on top)
    toShow.sort((a, b) => b.coalesced.depth - a.coalesced.depth);

    // Write phase: position overlays
    for (let i = 0; i < toShow.length; i++) {
      const { coalesced, rect } = toShow[i];
      const element = acquireOverlay(coalesced.ownerWindow);
      if (!element) continue;

      const fillColor = heatColor(coalesced.count, 0.18);
      const borderColor = heatColor(coalesced.count, 0.75);
      const labelBackground = heatColor(coalesced.count, 0.9);

      const style = element.style;
      style.top = `${rect.top}px`;
      style.left = `${rect.left}px`;
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.backgroundColor = fillColor;
      style.border = `1.5px solid ${borderColor}`;
      style.setProperty("--rdu-opacity", String(config.opacity));
      style.animation = `${OVERLAY_ANIMATION_NAME} ${config.animationDuration}ms ease-out forwards`;

      const label = element.firstElementChild as HTMLElement;
      if (config.showLabels) {
        const countText = coalesced.count > 1 ? ` ×${coalesced.count}` : "";
        const durationText =
          coalesced.totalDuration > 0
            ? ` ${coalesced.totalDuration.toFixed(1)}ms`
            : "";
        const causeText = coalesced.causeSummary
          ? ` (${coalesced.causeSummary})`
          : "";
        label.textContent = `${coalesced.component}${countText}${durationText}${causeText}`;
        label.style.backgroundColor = labelBackground;
      } else {
        label.textContent = "";
        label.style.backgroundColor = "transparent";
      }
    }
  }

  function push(entry: HighlightEntry) {
    pending.push(entry);
    if (!timer) {
      timer = setInterval(flush, config.flushInterval);
    }
  }

  function dispose() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    pending = [];
  }

  return { push, dispose };
}
