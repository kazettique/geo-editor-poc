# Geo Editor PoC — findings and recommendation

Covers the Expected Output of [`poc-requirement.md`](../poc-requirement.md).
Option tables live in [comparison.md](./comparison.md).

**Scope note.** This PoC was built standalone, but statements about Re:Earth CMS's *current*
Geometry Editor / Geometry Object fields are no longer inferred: they were read from the
source at commit `5cb0cbf82` and are set out in
[current-implementation.md](./current-implementation.md), which answers Investigation Area 1
of the research brief. This report cites that document rather than re-deriving it.

**Backend caveat.** The backend definition for a unified Geometry field is not decided, and
the stored structure is expected to change. Nothing below treats the *current* server shape
— the bare-geometry value, the two supported-type enums — as a constraint or a blocker.
They are recorded only where the frontend must avoid hard-coding them.

---

## 1. Why the editing methods are separated

**In CMS specifically, the separation is two lines of code.** There is one component —
`Common/Form/GeometryItem/index.tsx` — holding both panes, and one boolean decides which
of them may write: `readOnly: disabled || isEditor` makes the JSON pane read-only in
Geometry **Editor** mode (`:144`), and `isEditor && !disabled` hides the draw toolbar in
Geometry **Object** mode (`:551`). Text → map rendering already runs in *both* modes. So
the panes already share one value and already live in one component; what is withheld is
write access, withheld symmetrically so only one pane is ever authoritative.

**That is product design, not a technical limitation and not an OpenLayers constraint.**
Full evidence in [current-implementation.md](./current-implementation.md) §3.

It is a defensible original decision, because the problems it sidesteps are real. Any
unified editor has to solve three of them, and this is what makes naive two-way binding
fail:

- **The text editor owns a string buffer that is invalid JSON most of the time.** Between
  the `{` and the matching `}`, the document does not parse. A naive binding would either
  reject every keystroke or push garbage into the map.
- **The map owns a mutable feature graph in a different projection.** OpenLayers works in
  EPSG:3857 and emits a change event on every mouse move of a drag — tens per second.
- **Round-tripping is lossy.** Measured in this PoC: `[139.767125, 35.681236]` through
  4326 → 3857 → 4326 comes back as `[139.767125, 35.68123599999997]`.

Wire them together naively and you get the two classic failures: the editor's text is
replaced under the user's cursor, and map ↔ text updates echo each other forever, because
each round-trip produces a value that differs in the 14th decimal.

**All three are solvable.** This PoC solves them with:

| Problem                    | Solution                                                                                                                   | Where                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Invalid intermediate text  | Debounce 300 ms, parse, commit only on success; invalid text stays local with Monaco's markers                             | `src/editor/JsonEditor.tsx`           |
| Event storms during a drag | Commit on `drawend`/`modifyend`/`translateend` only, never on continuous change events                                     | `src/map/useMapInteractions.ts`       |
| Lossy round-trip           | Round every coordinate to 7 decimals (~1 cm) on entry to the store, then drop commits that are deep-equal to current state | `src/core/GeoUtils.ts`, `geoStore.ts` |

The architecture is one canonical `FeatureCollection` in WGS84 held outside React, with
every commit tagged by origin (`TEXT` / `MAP` / `NUMERIC` / `SEARCH`) and a monotonic
`revision`. Each pane records the last revision it applied and ignores its own echo.

**Conclusion: nothing blocks unification.** The separation is a permission flag guarding
problems that are real but solved; removing the flag is safe once the sync model above is
in place. This PoC demonstrates that model.

---

## 2. What the PoC validates

| Requirement                                                     | Status                                    |
| --------------------------------------------------------------- | ----------------------------------------- |
| An existing point value can be loaded on the map                | Implemented — seeded 東京駅 feature       |
| The point can be placed or moved from the map                   | Implemented — Draw + Modify + Translate   |
| Latitude and longitude can be edited numerically                | Implemented — commits on blur/Enter       |
| The map and coordinate inputs remain synchronised               | Implemented — shared store, origin-tagged |
| A location search result can be used to set or update the point | Implemented — two providers               |

**Verified by automated checks (71 total, all passing):**

- Store semantics — rounding, no-op suppression, id allocation, selection lifecycle,
  batched commits (23 checks).
- Projection round-trip — stable across 10 cycles for Point, LineString, Polygon,
  MultiPolygon and GeometryCollection (11 checks).
- Vertex addressing — including polygon ring closure and interior rings (23 checks).
- Live geocoder parsing — both providers, Japanese and English, plus abort handling
  (14 checks, run against the real endpoints).

These were written as throwaway scripts outside the repo and are **not currently
committed** — see §5 Hardening.

**Verified in a browser on 2026-09-10.** All eleven steps of the §6 checklist were walked
against `bun dev`, and **all eleven pass**. Two of them needed the step's own wording fixed
first — steps 8 and 10 produced false failures because the instruction was wrong, not the
code. No defect was found in the behaviour they exercise.

The automated checks listed above are still **uncommitted throwaway scripts**, and there is
still no test runner in `package.json`. Browser verification does not change that; porting
them to Vitest remains open in §5 Hardening.

---

## 3. Technical blockers, limitations and risks

### 3.1 Monaco is disproportionately heavy — highest risk

Monaco's default entry registers all ~90 bundled languages, which drags in the
TypeScript, CSS and HTML language services and their workers:

|                 | Default `import "monaco-editor"`                           | Trimmed to JSON only     |
| --------------- | ---------------------------------------------------------- | ------------------------ |
| main chunk      | 4,202 kB (1,084 kB gzip)                                   | 3,595 kB (928 kB gzip)   |
| workers emitted | ts 6,914 + css 1,075 + html 740 + json 430 + editor 300 kB | json 430 + editor 300 kB |
| **total JS**    | **~13.7 MB**                                               | **~4.3 MB**              |

The trim (`src/editor/monacoRuntime.ts`) is a 68% cut and costs 20 lines. But **3.6 MB
for one form field is still hard to justify.** For production, either lazy-load the editor
behind the field's "edit as JSON" affordance, or replace it — CodeMirror 6 does JSON
syntax highlighting, linting and schema-driven autocomplete at roughly a tenth of the
size. Recommend evaluating CodeMirror 6 explicitly before committing to Monaco.

### 3.2 CORS — resolved, neither geocoder needs a proxy

Originally flagged as a blocker, because the geocoder checks ran under Node, which does not
enforce CORS. The guess recorded here was that **GSI was the likelier of the two to need a
proxy.** That guess was wrong: browser verification on 2026-09-10 returned live results from
both Nominatim and GSI, so neither is CORS-blocked and neither needs a proxy to be called
directly from the CMS front end.

Two adjacent concerns are *not* settled by this and stay open:

- **A key-bearing provider still needs a server-side proxy** — not for CORS, but so the key
  never reaches the browser. That applies to YOLP, and is tracked under §5 Search integration.
- **Nominatim's usage policy** is untouched by this result — see §3.3 immediately below.

The error handling is still worth keeping as written: `fetch` rejects with an indistinguishable
`TypeError` for network and CORS failures alike, so the message names both deliberately.

### 3.3 The public Nominatim endpoint is not production-viable

Its usage policy caps traffic at 1 req/s and asks for an identifying `User-Agent` — which
browsers refuse to let scripts set, so requests are identified only by `Referer`. Using it
for CMS production traffic would breach the policy regardless of volume.

**This is a present exposure, not a future one.** CMS already calls
`https://nominatim.openstreetmap.org/search` directly from the browser
(`GeometryItem/index.tsx:332`). The risk is therefore already taken; what the
recommendation in §4 changes is that it stops being taken.

### 3.4 Geometry-type limitations

The table below describes **this PoC**. For contrast, CMS today has no map-side editing of
existing geometry at all: it imports `Draw` and nothing else — no `Modify`, `Translate`,
`Select` or `Snap` — so a placed geometry can only be replaced by drawing a new one, behind
a "this will replace the previously entered value" confirm
([current-implementation.md](./current-implementation.md) §4.1). Everything in the "Map
editing" column is therefore new capability, not capability to preserve.

| Type                                        | Renders | Map editing | Numeric editing                             |
| ------------------------------------------- | ------- | ----------- | ------------------------------------------- |
| Point                                       | Yes     | Yes         | Yes                                         |
| LineString                                  | Yes     | Yes         | Yes, per vertex                             |
| Polygon                                     | Yes     | Yes         | Yes, per vertex, ring closure maintained    |
| MultiPoint / MultiLineString / MultiPolygon | Yes     | Yes         | **Not directly** — surfaced as non-editable, but convertible to an editable kind |
| GeometryCollection                          | Yes     | Yes         | **Not directly** — same escape hatch        |

Details worth carrying forward:

- **The gap is ours, not OpenLayers'.** `Modify` is constructed as `new Modify({ source })`
  (`src/map/useMapInteractions.ts:68`) — bound to the whole vector source rather than to the
  selection — and ol handles every Multi\* type *and* `GeometryCollection` natively:
  `ol/interaction/Modify.js:424` registers a `GeometryCollection` segment writer, and
  `ol/format/GeoJSON.js:353,546` read and write one. `commitFeatures`
  (`useMapInteractions.ts:33-42`) writes back whatever geometry comes out, so all of these
  types are vertex-draggable on the map today.

  An earlier draft of this report stated that ol's `Modify` had no `GeometryCollection`
  support. That was wrong, and it inflated the estimate in §5.
- **What is actually missing is the numeric layer.** `GeoUtils.listVertices` returns `[]` for
  every Multi\* type and for `GeometryCollection`, and `GeoUtils.setVertex` passes them
  through unchanged. The inspector therefore cannot address their vertices, and says so.
  Closing this means a sub-geometry selection model in *our* store — which ring, which
  polygon, which child geometry you are editing — not an ol capability.
- **The form pane softens this from a dead end into a one-way door.** `GeoUtils.flattenPositions`
  walks all seven kinds, so the form's type selector can convert a MultiPolygon or a
  GeometryCollection *down* to Point, LineString or Polygon, warning first with the exact count
  of positions it would discard. That is a usable escape hatch, not a substitute for the
  selection model — the conversion is one-way and flattens every source ring into a single
  ring, which keeps all positions but can produce a self-intersecting polygon.
- **`Draw` still cannot produce a `GeometryCollection`.** That half of the original note holds.
  The data path is fine regardless: it round-trips through ol's GeoJSON format losslessly
  (verified).
- **Polygon ring closure is a live correctness trap.** A ring's last position must repeat
  its first. Numeric editing of vertex 1 must move both, or the field silently produces
  invalid GeoJSON. Handled here and covered by tests; any reimplementation needs the same.
- **Large geometries will strain the text pane.** A polygon with thousands of vertices
  produces a huge JSON document that gets re-serialised on every map gesture. Not hit in
  this PoC — flagged as a scaling risk.

### 3.5 Feature ids become visible in the JSON

The map diffs on `feature.id`, so features arriving without one are assigned `f1`, `f2`…
and those ids appear in the text pane. This is defensible — stable identity is needed
regardless — but it is a visible behaviour change. The alternative is a side table keyed
by array index, which breaks on reorder.

**Whether this survives depends on the value shape the backend settles on.** Ids are a
consequence of the PoC holding a `FeatureCollection`; a single-geometry value has nothing
to diff and needs no ids (see §3.8).

### 3.6 Concurrent-edit conflicts need a real answer

If the map changes while the user is mid-keystroke, silently overwriting destroys their
typing. The PoC detects this and shows a "Changed elsewhere while you were typing —
Discard & reload" bar. That is honest but minimal; a production field with collaborative
editing needs a considered merge story.

The **form pane has no equivalent guard.** A map drag or a text edit that lands while a
coordinate field is mid-typing replaces the draft outright, because `NumberField` resets
its draft whenever the `value` prop changes. That was already true of the inspector; the
form makes it far more visible, since every vertex of the selected feature is on screen
during a drag. Same merge story, more surface.

### 3.7 monaco 0.56 API breaks

Two changes that will bite anywhere in CMS: `monaco.languages.json` is now a deprecation
stub (use the top-level `json` namespace), and the old `monaco-editor/esm/vs/...` worker
specifiers no longer resolve because 0.56 ships an exports map rewriting `./*` to
`./esm/vs/*.js`.

### 3.8 The PoC's value shape does not match the field's — keep the adapter thin

This PoC's store holds a `FeatureCollection` of many features. The CMS field today holds a
**single bare GeoJSON geometry** serialized to a string, with repeated values carried as
`string[]` — one geometry per entry, so a "multiple" Point field is N Points, not a
MultiPoint ([current-implementation.md](./current-implementation.md) §2).

The backend definition is undecided and this shape may change, which is the point: **the
sync machinery must not assume either shape.** The origin/revision model, the 7-decimal
rounding and the no-op suppression are all independent of the envelope, and the conversion
should sit in one adapter at the store boundary rather than being spread through the panes.
Written that way, a backend change is a one-file change.

### 3.9 The current field rebuilds its map layer on every value change

`sketch()` removes every layer above index 0 and constructs a fresh `VectorSource`,
`VectorLayer` and `Style` each time the value changes — in Geometry Object mode, on every
keystroke (`GeometryItem/index.tsx:426-466`). Two consequences worth carrying forward:

- **It is the structural reason `Modify` cannot simply be added to the current code.** An
  interaction bound to the source would be discarded on the next character typed. A
  unified field needs the diffed-update model this PoC uses, not an incremental patch to
  `sketch()`.
- The view also re-`fit`s on every change in Object mode, because the guard is
  `isInitRef.current || !isEditor` (`:454`) — the map recentres while the user types.

---

### 3.10 The form pane's own limitations

Added after the original write-up, so these are new rather than revised:

- **Row cap.** A feature renders at most 200 vertex rows, then says
  *"Showing 200 of N vertices — edit the rest in the text pane."* The cap is applied inside
  `GeoUtils.listVertices` rather than by slicing its result, so a 5,000-vertex paste never
  allocates 5,000 refs per commit. Production wants virtualised rows instead.
- **Column order differs from the inspector.** The form shows **Longitude then Latitude**,
  matching GeoJSON's `[lon, lat]` document order, because it is a view of the JSON. The
  inspector shows Latitude first. Both are defensible alone; together they are a wart, and
  a production field should pick one.
- **Type conversion is one-way and lossy by design.** It is gated on a confirm that names
  the exact number of positions being discarded (`GeoUtils.droppedPositions` compares
  positions by value, not by count, so a conversion that derives new positions while
  dropping real ones is still reported as lossy). There is no "convert back" — undo is the
  only route back.
- **Undo granularity is per edit, deliberately.** Form commits carry `EditOrigin.FORM`,
  which is *not* in `COALESCING_ORIGINS`. Reusing `NUMERIC` would have folded a tab across
  four vertex fields into one undo step, because the 600 ms coalescing window keys on origin
  alone and `NumberField` commits only on blur or Enter — there is no per-keystroke burst
  for it to usefully merge.
- **No accessibility work.** Keyboard-only vertex editing, focus order and screen-reader
  labelling are as absent here as everywhere else in the PoC (§5).

---

## 4. Recommendation

**Keep OpenLayers for rendering and editing. Add a separate search layer. Do not adopt
Google.**

Mapped to the requirement's four options, this is *"keep the current provider and add a
separate search service"*, with the nuance that search should be **two providers, not one**.

One correction to the framing: **search is not a new integration, it is an existing one to
redirect.** CMS already has a search box wired to Nominatim — it just calls
`view.animate()` and never writes the value, so the user still has to draw manually on the
newly centred map (`GeometryItem/index.tsx:328-347`). The missing piece the brief asks for,
*"applying the result to a Geometry field"*, is the write. Two further things the existing
integration lacks: it uses only `data[0]` and discards the rest, so there is no result list
to choose from, and failures are `console.error` only.

### Why keep OpenLayers

The drawing and geometry-editing layer is the strongest part of the current stack, and
replacing it buys nothing this project needs. `Draw` + `Modify` + `Snap` + `Translate`
gave vertex-level editing, snapping and whole-geometry dragging with no extra dependency
and no API key. Its one real gap — GeometryCollection — is not fixed by any alternative.
Migrating to MapLibre would mean adopting a separate draw library *and* a tile provider,
to gain rendering quality that a form field does not need. ol adds ~330 kB raw / ~96 kB
gzip, an order of magnitude less than the editor sitting next to it.

The tile layer is worth revisiting independently: **地理院 tiles are free, authoritative
for Japan, and already working** in this PoC. That is a cheap, isolated improvement.

### Why search must be split

No single provider clears all three bars — Japanese addresses, Japanese place names, and
licence compatibility:

- **Google** has the best Japanese POI data and is **ruled out by licensing.** Its terms
  forbid using Content alongside a non-Google map (§10.5(5), §10.4(d)), so adopting it for
  search forces adopting it for rendering, and its 30-day caching cap conflicts with
  storing a coordinate in a CMS field.
- **Everything OSM-derived** — Nominatim, MapTiler, LocationIQ, Photon, Pelias — inherits
  the same Japanese POI weakness, because it is a data problem rather than an engine one.
- **GSI** is excellent and free for Japanese addresses and useless for place names.

**Proposed composition:**

| Need                       | Provider                                       | Rationale                                                                                                          |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Japanese addresses         | **GSI 地理院**                                 | Free, authoritative, no key, measured exact                                                                        |
| Japanese place names / POI | **Yahoo! JAPAN YOLP** ローカルサーチ           | Independent JP POI corpus; 50k req/day free; **commercial terms need legal review**                                |
| International              | **Nominatim self-hosted**, or Mapbox Geocoding | Self-hosting removes the rate-limit and policy problem; Mapbox is free to 100k/mo and does not couple to its tiles |

If a single provider is required for simplicity, **Mapbox Geocoding** is the best
compromise: no tile coupling, free to 100k/mo, decent multilingual support — accepting
weaker Japanese POI results than YOLP.

### Confidence

High on "keep OpenLayers" and on the Google exclusion — both rest on measured or quoted
evidence. **Medium on YOLP**, which was researched but not exercised: its commercial terms
and its browser key-exposure story both need checking before commitment.

---

## 5. Follow-up work for production

Rough breakdown, assuming the recommendation above.

**Decide first (blocking, ~1 week)**

- Legal review of Yahoo! YOLP commercial terms, and of GSI's 利用規約 for CMS use.
- Confirm CORS behaviour of YOLP from a browser; decide proxy vs direct. GSI and Nominatim
  are already settled — both were verified working direct from the browser (§3.2).
- Editor decision: lazy-loaded Monaco vs CodeMirror 6. Prototype CodeMirror to compare
  bundle and schema-autocomplete quality.

**Core field implementation (~3–4 weeks)**

- Port the store, origin/revision sync and rounding into CMS's field architecture.
- Wire to CMS's form state, validation and dirty-tracking; reconcile the "commit on
  blur/Enter" model with how CMS saves fields. The field is an antd `Form.Item` child with
  `value`/`onChange` injected, and errors are lifted through an `errorSet` that rejects
  submission — both already work and should be kept.
- **Map-side editing is new work.** `Modify`, `Translate` and `Snap` do not exist in the
  current field (§3.4), and the diffed layer update has to replace `sketch()`'s
  teardown-and-rebuild before any of them can stay bound (§3.9).
- Keep the value-shape conversion in a single adapter at the store boundary (§3.8) — the
  backend definition is still open, so this is the part most likely to move.
- Selection and focus as field-local state rather than a module singleton.
- Accessibility: keyboard-only vertex editing, focus order, screen-reader labels — all
  absent from this PoC.

**Search integration (~2 weeks)**

- Redirect the **existing** search box so a chosen result writes the field value instead of
  only panning the camera (§4), and surface the full result list rather than `data[0]`.
- Provider abstraction is already the right shape (`GeocodeProvider`); add YOLP.
- Server-side proxy for key-bearing providers, so no key reaches the browser.
- Rate limiting, caching (respecting each provider's terms), error and empty states.
- Attribution rendering per provider — a licence requirement, not a nicety.

**Geometry-type completion (~2 weeks)**

- Multi\* and GeometryCollection *numeric* editing, via sub-geometry selection in the store.
  Once the interactions listed under Core field implementation are in place, ol handles
  map-side editing for all of them (§3.4), so this remaining item is inspector and store
  work rather than map work — which is why it is smaller than the 2–3 weeks first estimated.
- GeometryCollection: decide whether to expose editing at all, or render read-only and
  document it. Recommend the latter for v1 — the selection model is the cost, not ol.
- Performance work for large geometries — virtualised text rendering or a summary view
  above a vertex-count threshold.

**Hardening (~2 weeks)**

- Real test suite. The scratch checks written for this PoC (store, projection, vertex,
  geocoder) should be ported to Vitest and kept.
- Concurrent-edit / conflict UX.
- Error handling for tile and geocoder outages.
- Migration plan for existing Geometry Editor and Geometry Object field values —
  explicitly out of scope here, and likely the largest single unknown.

**Rough total: 10–12 weeks**, frontend only — excluding migration, and excluding whatever
the still-undecided backend definition brings with it. The blocking decisions are cheap and
should be resolved first, because the editor choice and the YOLP terms both change the
shape of the work.

---

## 6. How to verify this PoC

```bash
bun install
bun dev          # http://localhost:5173
```

Walked in a browser on 2026-09-10 — **all eleven steps pass.** Steps 8 and 10 have been
reworded: both produced false failures on the first walk because the instruction was wrong,
not the code.

1. **Load** ✅ — the seeded 東京駅 point renders and the view frames it.
2. **Map → text** ✅ — drag the point; the JSON and the lat/lng fields both follow, staying
   at 7 decimals, with no cursor jump and no flicker.
3. **Text → map** ✅ — edit a coordinate in the JSON; the marker moves.
4. **Numeric → map** ✅ — type a latitude, press Enter; the marker moves. Press Esc mid-edit
   and the field reverts.
5. **Invalid text** ✅ — type a broken brace. Monaco shows a squiggle, the status bar turns
   red, the map holds its last valid state, and recovery is clean.
6. **Draw** ✅ — draw a LineString and a Polygon; drag individual vertices; confirm the
   vertex dropdown addresses them correctly.
7. **Ring closure** ✅ — numerically edit a polygon's Vertex 1 and confirm the shape stays
   closed in the JSON.
8. **Search** ✅ — **a comparison, not a pass/fail.** Search `東京駅` and `丸の内一丁目` on
   both providers and compare. The expected outcome, already documented at
   `src/search/providers/gsi.ts:15-20`:
   - **GSI returns nothing useful for `東京駅`.** It is an *address* index, not a place index,
     so it matches on the 東 character and surfaces 北海道札幌市東区. **That is the finding,
     not a bug** — it is the evidence behind "why search must be split" in §4.
   - **GSI resolves `丸の内一丁目` precisely**, to one representative point for the whole
     chōme. Block-level rather than building-level precision is what an address index gives
     you; it is not an accuracy defect.
   - **Nominatim answers both**, but watch the amber `kind` badge — that is what exposes its
     footway result for 東京駅.
9. **Apply** ✅ — click a result with a Point selected (updates it) and with nothing selected
   (adds one). The map recentres either way. Note that with a **Line or Polygon** selected it
   adds a new Point rather than doing nothing (`src/search/SearchPanel.tsx:72`); the panel
   footer says so, but confirm it is the behaviour CMS wants.
10. **Non-editable types** ✅ — paste the payload below, **then click the shape on the map.**
    The inspector should read `mpoly · MultiPolygon renders but is not numerically editable`.

    The click is the part that matters: the hint is gated on selection
    (`src/inspector/CoordinateInputs.tsx:15-20`) and a paste commits with `EditOrigin.TEXT`
    without selecting anything, so an unselected paste shows *"Select a feature on the map to
    edit its coordinates"* and reads as a failure. The payload sits next to 東京駅 on purpose:
    the view fits **once** (`src/map/MapView.tsx:130-139`), so sample data from elsewhere in
    the world renders correctly but off-screen.

    ```json
    {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "id": "mpoly",
          "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
              [[[139.765,35.680],[139.769,35.680],[139.769,35.6825],[139.765,35.6825],[139.765,35.680]]],
              [[[139.770,35.683],[139.773,35.683],[139.773,35.685],[139.770,35.685],[139.770,35.683]]]
            ]
          },
          "properties": {}
        },
        {
          "type": "Feature",
          "id": "gcoll",
          "geometry": {
            "type": "GeometryCollection",
            "geometries": [
              { "type": "Point", "coordinates": [139.7625, 35.6785] },
              { "type": "LineString", "coordinates": [[139.7605,35.6770],[139.7645,35.6770]] }
            ]
          },
          "properties": {}
        }
      ]
    }
    ```

    That `mpoly` has 10 positions, so the hint should end `— 10 positions`. One walk reported
    11; most likely the pasted JSON differed, but if it recurs, suspect `GeoUtils.countNested`
    (`src/core/GeoUtils.ts:214-221`).
11. **Base maps** ✅ — toggle OSM ↔ 地理院淡色 and confirm editing and search are unaffected.

### Form pane — steps 12-19

Added with the form editor (§3.10). **Not yet walked in a browser**; steps 1-11 above were.
The geometry and store layers underneath them are covered by 102 scratch checks (82 on the
geometry helpers, 20 on store semantics), which are again uncommitted — same §5 Hardening item.

12. **Both blocks open** — the GeoJSON pane splits into a Text block and a Form block, both
    expanded, with the seeded `f1` card showing one `Coordinate` row.
13. **Collapse round-trip — the Monaco test.** Type a broken brace so the status bar turns
    red, collapse Text, re-expand. **The broken text, the red bar, the caret and the scroll
    position must all still be there.** They are only preserved because the block is hidden
    rather than unmounted: `@monaco-editor/react` disposes the model on unmount, and
    `JsonEditor`'s cleanup clears a pending 300 ms commit, so an edit typed just before
    collapsing would be silently lost.
14. **Form → map → text** — edit a longitude, press Enter: the marker moves and the JSON
    follows at 7 decimals. Esc mid-edit reverts the field without committing.
15. **Type conversion, lossless** — set `f1` to LineString (2 rows, no confirm), then Polygon
    (3 rows, no confirm), then back to LineString (all vertices kept, no confirm).
16. **Type conversion, lossy** — with the Polygon selected choose Point. The confirm names
    the discarded count. **Cancel: the select must snap back to Polygon** and the map must not
    move. Accept: one row remains, and a single ⌘Z restores the whole polygon.
17. **Ring-aware insert and remove** — on a Polygon, `+` on the **last** row inserts the
    midpoint between it and vertex 1; check the JSON shows the ring still closed. Remove rows
    until `✕` disables at 3 vertices. Then edit Vertex 1's latitude and confirm the closing
    position tracks it.
18. **Undo granularity** — add a vertex, convert the type, add a feature: three ⌘Z presses,
    each undoing exactly one action (focus must be outside an input). Then edit two different
    coordinate fields within half a second and confirm they are **two** undo steps, not one —
    that is what `EditOrigin.FORM` buys over `NUMERIC`. Finally, focus a coordinate input,
    type, and press ⌘Z: only the text undoes, the map does not move.
19. **Non-editable types and the cap** — re-paste the step 10 payload. The `mpoly` card shows
    the non-editable hint with its position count, and its type select shows `MultiPolygon` as
    a **disabled** option alongside the three editable targets; picking Polygon warns first.
    Then paste a polygon with over 200 vertices and confirm the card renders 200 rows plus the
    "Showing 200 of N" notice, and that the pane stays responsive.

```bash
bun run build    # tsc -b + vite build
bun lint
```
