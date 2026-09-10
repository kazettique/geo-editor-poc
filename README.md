# Geo Editor PoC

A non-production proof of concept for a Geometry field that keeps a **GeoJSON text
editor**, an **interactive map** and a **location search** bi-directionally in sync.

Built against [`poc-requirement.md`](./poc-requirement.md).

```bash
bun install
bun dev          # http://localhost:5173
```

## Deliverables

| Document                                     | Contents                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/report.md`](./docs/report.md)         | Why the editing methods are separated, blockers and limitations, recommendation, follow-up breakdown, manual verification checklist |
| [`docs/comparison.md`](./docs/comparison.md) | Location-search and map-stack option tables, with measured results                                                                  |

**Headline finding:** neither free geocoder gives usable Japanese place-name search — GSI
is address-only, and Nominatim ranks footpaths above Tokyo Station. Google has the data
but its licence forbids pairing it with a non-Google map. See the report.

## Architecture

One canonical `FeatureCollection` in WGS84 lives outside React
(`src/core/geoStore.ts`). Every commit carries an `EditOrigin` and bumps a monotonic
`revision`; each pane records the last revision it applied and ignores its own echo.
Coordinates are rounded to 7 decimals on entry, and commits that are deep-equal to
current state are dropped — together these stop the panes rewriting each other.

```
src/
  core/       store, GeoJSON validation (zod), geometry helpers
  editor/     Monaco pane — JSON-only build, schema-driven autocomplete
  map/        OpenLayers — rendering, diffed sync, Draw/Modify/Translate/Snap
  inspector/  numeric lat/lng editing, vertex addressing
  search/     GeocodeProvider abstraction + Nominatim and GSI implementations
```

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · OpenLayers 10 · Monaco 0.56 · zod 4

## Status

Feature-complete against the requirement's five validation checkboxes, and verified by
71 automated checks. **Not yet verified in a browser** — see §2 and §6 of the report.
