# react-debug-updates

See exactly which React components re-render, how often, how long they take, and *why* — all without modifying your components.

![highlight overlays](https://img.shields.io/badge/overlays-visual%20highlights-61dafb) ![zero config](https://img.shields.io/badge/setup-zero%20config-green)

<img src="demo.gif" alt="demo" width="852" height="476" />

## Why?

I was working on an Electron app and spent hours trying to get the official React DevTools to work with it. DevTools' Electron integration is fragile, poorly documented, and breaks between versions. I just needed to see which components were re-rendering so I could fix performance issues.

So I wrote this — a plug-and-play one-liner that gives you visual highlight overlays and console logging for React re-renders. No browser extension, no Electron hacks, no configuration. Works in any React web environment — browsers, Electron, iframes.

## How it works

Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__` to intercept every React commit. Uses the same fiber tree diffing approach as React DevTools to detect which components actually re-rendered. No React DevTools extension required. No wrappers, no HOCs, no code changes — just call `monitor()` and you get:

- **Visual overlays** — highlight boxes on re-rendered DOM nodes with a heat-map color scale (blue → red as render count increases)
- **Console logging** — grouped, color-coded re-render reports with component tree paths and render durations
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

Import and call `monitor` **before** React renders anything — ideally at the very top of your entry point. This ensures the hook is in place before the first commit.

```ts
import { monitor } from "react-debug-updates";

// One-liner — overlays + console logging out of the box
const updates = monitor();

// Later, to clean up:
updates?.stop();
```

### Dev-only guard

```ts
if (process.env.NODE_ENV === "development") {
  const { monitor } = await import("react-debug-updates");
  monitor();
}
```

### With options

```ts
monitor({
  showCauses: true,
  opacity: 0.5,
  showLabels: false,
  silent: true, // overlays only, no console output
});
```

## Requirements

- A **React dev build** (which automatically creates `__REACT_DEVTOOLS_GLOBAL_HOOK__`) — no browser extension needed
- For `showCauses` and render durations: React must be in **dev mode** (provides `_debugHookTypes` and `actualDuration` on fibers)

## API

### `monitor(options?): UpdateMonitor | null`

Returns an `UpdateMonitor` handle, or `null` if the DevTools hook is not available.

#### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `"self-triggered" \| "all"` | `"self-triggered"` | `"self-triggered"` tracks only components whose own state changed. `"all"` includes children swept by parent updates |
| `showCauses` | `boolean` | `false` | Detect and display why each component re-rendered |
| `silent` | `boolean` | `false` | Suppress console output |
| `overlay` | `boolean` | `true` | Enable visual highlight overlays |
| `showLabels` | `boolean` | `true` | Show text labels (name, count, duration, cause) above overlays |
| `opacity` | `number` | `0.3` | Peak opacity of overlay highlights (0–1) |
| `flushInterval` | `number` | `250` | Milliseconds between overlay flush cycles |
| `animationDuration` | `number` | `1200` | Overlay fade-out animation duration (ms) |
| `bufferSize` | `number` | `500` | Max entries kept in the ring buffer |
| `filter` | `(entry: RenderEntry) => boolean` | — | Return `false` to skip an entry |

### `UpdateMonitor`

| Property | Type | Description |
| --- | --- | --- |
| `entries` | `RenderEntry[]` | Ring buffer of recorded re-render entries |
| `stop` | `() => void` | Unhook from React and remove all overlays |

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
