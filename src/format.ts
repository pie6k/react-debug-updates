import type { UpdateCause } from "./types.js";

// ────────────────────────────────────────────
// Value formatting
// ────────────────────────────────────────────

export function formatValue(value: unknown, maxLength = 50): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "function")
    return `ƒ ${(value as { name?: string }).name || "anonymous"}`;

  if (typeof value === "string") {
    const truncated =
      value.length > maxLength ? value.slice(0, maxLength) + "…" : value;
    return JSON.stringify(truncated);
  }

  if (Array.isArray(value)) return `Array(${value.length})`;

  if (typeof value === "object") {
    const name = (value as object).constructor?.name;
    if (name && name !== "Object") return name;
    const keys = Object.keys(value as object);
    if (keys.length <= 3) return `{ ${keys.join(", ")} }`;
    return `{ ${keys.slice(0, 3).join(", ")}, … }`;
  }

  return String(value);
}

// ────────────────────────────────────────────
// Cause formatting
// ────────────────────────────────────────────

/** Compact summary for overlay labels. */
export function formatCausesShort(causes: UpdateCause[]): string {
  if (causes.length === 0) return "";

  const parts: string[] = [];
  for (const cause of causes) {
    if (cause.kind === "props") {
      parts.push("props");
    } else if (cause.kind === "class-state") {
      parts.push("state");
    } else if (cause.kind === "hook" && cause.hookType) {
      const indexSuffix = cause.hookIndex != null ? `[${cause.hookIndex}]` : "";
      parts.push(`${cause.hookType}${indexSuffix}`);
    } else {
      parts.push("?");
    }
  }

  return parts.join(", ");
}

/** Detailed lines for console output. */
export function formatCausesConsole(causes: UpdateCause[]): string[] {
  const lines: string[] = [];

  for (const cause of causes) {
    if (cause.kind === "props") {
      lines.push("  ↳ props changed (parent re-rendered)");
    } else if (cause.kind === "class-state") {
      lines.push("  ↳ class state changed");
    } else if (cause.kind === "hook" && cause.hookType) {
      const indexSuffix =
        cause.hookIndex != null ? `[${cause.hookIndex}]` : "";
      const name = `${cause.hookType}${indexSuffix}`;

      if (cause.previousValue !== undefined && cause.nextValue !== undefined) {
        lines.push(
          `  ↳ ${name}: ${formatValue(cause.previousValue)} → ${formatValue(cause.nextValue)}`,
        );
      } else {
        lines.push(`  ↳ ${name} changed`);
      }
    } else {
      lines.push("  ↳ unknown cause");
    }
  }

  return lines;
}
