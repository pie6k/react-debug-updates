# react-debug-updates

Visual debugging overlays and console logging for React re-renders. See exactly which components re-render, how often, how long they take, and *why* they re-rendered — all without modifying your components.

![highlight overlays](https://img.shields.io/badge/overlays-visual%20highlights-61dafb) ![zero config](https://img.shields.io/badge/setup-zero%20config-green)

<img src="demo.gif" alt="demo" width="852" height="476" />

## How it works

Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__` to intercept every React commit. No wrappers, no HOCs, no code changes — just call `attachRenderLogger()` and you get:

- **Console logging** — grouped, color-coded re-render reports with component tree paths and render durations
- **Visual overlays** — highlight boxes on re-rendered DOM nodes with a heat-map color scale (blue → red as render count increases)
- **Cause detection** — pinpoint *which* `useState`, `useReducer`, `useSyncExternalStore`, or `useContext` hook triggered each re-render, with previous→next values

## Install

```bash
npm install react-debug-updates
# or
yarn add react-debug-updates
# or
pnpm add react-debug-updates
```

## Quick start

```ts
import { attachRenderLogger } from "react-debug-updates";

// Call early in your app's entry point (dev only)
const logger = attachRenderLogger({
  highlight: true,
  showCauses: true,
});

// Later, to clean up:
logger?.disconnect();
```

### Dev-only guard

```ts
if (process.env.NODE_ENV === "development") {
  const { attachRenderLogger } = await import("react-debug-updates");
  attachRenderLogger({ highlight: true, showCauses: true });
}
```

## Requirements

- React **DevTools extension** installed, OR a **React dev build** (the library needs `__REACT_DEVTOOLS_GLOBAL_HOOK__`)
- For `showCauses` and render durations: React must be in **dev mode** (provides `_debugHookTypes` and `actualDuration` on fibers)

## API

### `attachRenderLogger(options?): RenderLogger | null`

Returns a `RenderLogger` handle, or `null` if the DevTools hook is not available.

#### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `silent` | `boolean` | `false` | Suppress console output |
| `mode` | `"self-triggered" \| "all"` | `"self-triggered"` | `"self-triggered"` tracks only components whose own state changed. `"all"` includes children swept by parent updates |
| `bufferSize` | `number` | `500` | Max entries kept in the ring buffer |
| `filter` | `(entry: RenderEntry) => boolean` | — | Return `false` to skip an entry |
| `highlight` | `boolean \| HighlightOptions` | `false` | Enable visual overlay highlights |
| `showCauses` | `boolean` | `false` | Detect and display why each component re-rendered |

#### `HighlightOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `flushInterval` | `number` | `250` | Milliseconds between overlay flush cycles |
| `animationDuration` | `number` | `1200` | Overlay fade-out animation duration (ms) |
| `showLabels` | `boolean` | `true` | Show text labels (name, count, duration, cause) above overlays |

### `RenderLogger`

| Property | Type | Description |
| --- | --- | --- |
| `entries` | `RenderEntry[]` | Ring buffer of recorded re-render entries |
| `disconnect` | `() => void` | Unhook from React and remove all overlays |

### `RenderEntry`

| Property | Type | Description |
| --- | --- | --- |
| `component` | `string` | Component display name |
| `path` | `string` | Ancestor component path (e.g. `"App → Layout → Sidebar"`) |
| `duration` | `number` | Render duration in ms (requires React dev mode) |
| `timestamp` | `number` | `performance.now()` when the entry was recorded |
| `causes` | `UpdateCause[]` | Why this component re-rendered (requires `showCauses`) |

### `UpdateCause`

| Property | Type | Description |
| --- | --- | --- |
| `kind` | `"hook" \| "props" \| "class-state" \| "unknown"` | Category of the cause |
| `hookIndex` | `number?` | Source-order index of the hook (0-based) |
| `hookType` | `string?` | e.g. `"useState"`, `"useReducer"`, `"useContext"` |
| `previousValue` | `unknown?` | Previous hook state value |
| `nextValue` | `unknown?` | New hook state value |

## Console output

```
⚛ 3 re-renders
  Counter  App → Dashboard (0.42ms)
    ↳ useState[0]: 5 → 6
  TodoList  App → Dashboard (1.03ms)
    ↳ props changed (parent re-rendered)
  Sidebar  App (0.15ms)
    ↳ useContext changed
```

## Visual overlays

Re-rendered components get a highlight box that fades out. The color shifts from blue to red as the same node re-renders repeatedly within a flush window — making "hot" components visually obvious.

Each overlay label shows: `ComponentName ×count duration (cause)`

## License

MIT
