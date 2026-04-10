import type { HighlightOptions, PendingEntry } from "./types.js";
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
// Batched flush
// ────────────────────────────────────────────
//
// Commit path just pushes lightweight refs (no DOM reads, no formatting).
// Flush (setInterval): batched rect reads → batched DOM writes.

export const HIGHLIGHT_DEFAULTS: Required<HighlightOptions> = {
  flushInterval: 250,
  animationDuration: 1200,
  showLabels: true,
  opacity: 0.3,
};

interface CoalescedEntry {
  count: number;
  totalDuration: number;
  component: string;
  domNode: HTMLElement;
  ownerWindow: Window;
  causeSummary: string;
}

export function createBatcher(options: Required<HighlightOptions>) {
  let pending: PendingEntry[] = [];
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
      } else {
        const win = entry.domNode.ownerDocument?.defaultView;
        if (!win || win.closed) continue;
        map.set(entry.domNode, {
          count: 1,
          totalDuration: entry.duration,
          component: entry.component,
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

    // Write phase: position overlays (reverse order so parents render on top of children)
    for (let i = toShow.length - 1; i >= 0; i--) {
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
      style.setProperty("--rdu-opacity", String(options.opacity));
      style.animation = `${OVERLAY_ANIMATION_NAME} ${options.animationDuration}ms ease-out forwards`;

      const label = element.firstElementChild as HTMLElement;
      if (options.showLabels) {
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

  function push(entry: PendingEntry) {
    pending.push(entry);
    if (!timer) {
      timer = setInterval(flush, options.flushInterval);
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
