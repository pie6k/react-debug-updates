# react-debug-updates

See exactly which React components re-render, how often, how long they take, and *why* — all without modifying your components.

![highlight overlays](https://img.shields.io/badge/overlays-visual%20highlights-61dafb) ![zero config](https://img.shields.io/badge/setup-zero%20config-green)

<img src="demo.gif" alt="demo" width="852" height="476" />

## Why?

I was working on an Electron app and spent hours trying to get the official React DevTools to work with it. DevTools' Electron integration is fragile, poorly documented, and breaks between versions. I just needed to see which components were re-rendering so I could fix performance issues.

So I wrote this — a plug-and-play one-liner that gives you visual highlight overlays and console logging for React re-renders. No browser extension, no Electron hacks, no configuration. Works in any React web environment — browsers, Electron, iframes.

## How it works

Hooks into `__REACT_DEVTOOLS_GLOBAL_HOOK__` to intercept every React commit. Uses the same fiber tree diffing approach as React DevTools to detect which components actually re-rendered. No React DevTools extension required. No wrappers, no HOCs, no code changes — just call `startReactUpdatesMonitor()` and you get:

- **Visual highlights** — highlight boxes on re-rendered DOM nodes with a heat-map color scale (blue → red as render count increases)
- **Console logging** — grouped, color-coded re-render reports with component tree paths and render durations
- **Update reasons** — pinpoint *which* `useState`, `useReducer`, `useSyncExternalStore`, or `useContext` hook triggered each re-render, with previous→next values

## Install

```bash
npm install react-debug-updates
# or
yarn add react-debug-updates
# or
pnpm add react-debug-updates
```

## Quick start

Import and call `startReactUpdatesMonitor` **before** React renders anything — ideally at the very top of your entry point. This ensures the hook is in place before the first commit.

```ts
import { startReactUpdatesMonitor } from "react-debug-updates";

// One-liner — visual highlights out of the box
const stop = startReactUpdatesMonitor();

// Later, to clean up:
stop?.();
```

### Dev-only guard

```ts
if (process.env.NODE_ENV === "development") {
  const { startReactUpdatesMonitor } = await import("react-debug-updates");
  startReactUpdatesMonitor();
}
```

### With options

```ts
startReactUpdatesMonitor({
  reasonOfUpdate: true,
  logToConsole: true,
  highlightOpacity: 0.5,
  highlightShowLabels: false,
});
```

## Requirements

- A **React dev build** (which automatically creates `__REACT_DEVTOOLS_GLOBAL_HOOK__`) — no browser extension needed
- For `reasonOfUpdate` and render durations: React must be in **dev mode** (provides `_debugHookTypes` and `actualDuration` on fibers)

## API

### `startReactUpdatesMonitor(options?): (() => void) | null`

Returns a `stop` function to unhook from React and remove all overlays, or `null` if the DevTools hook is not available.

#### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `"self-triggered" \| "all"` | `"self-triggered"` | `"self-triggered"` tracks only components whose own state changed. `"all"` includes children swept by parent updates |
| `reasonOfUpdate` | `boolean` | `false` | Detect and display why each component re-rendered |
| `logToConsole` | `boolean` | `false` | Log re-renders to the console |
| `highlight` | `boolean` | `true` | Enable visual highlight overlays |
| `highlightShowLabels` | `boolean` | `true` | Show text labels (name, count, duration, cause) above highlights |
| `highlightOpacity` | `number` | `0.3` | Peak opacity of highlight overlays (0–1) |
| `highlightFlushInterval` | `number` | `250` | Milliseconds between highlight flush cycles |
| `highlightAnimationDuration` | `number` | `1200` | Highlight fade-out animation duration (ms) |

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

## Visual highlights

Re-rendered components get a highlight box that fades out. The color shifts from blue to red as the same node re-renders repeatedly within a flush window — making "hot" components visually obvious.

Each highlight label shows: `ComponentName ×count duration (cause)`

## License

MIT
