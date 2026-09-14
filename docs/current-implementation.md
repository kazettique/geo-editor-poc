# How the existing geometry field works

This PoC was built against an existing CMS geometry field. This document records how that
field behaves and what it cannot do, because that baseline is what the PoC's design responds
to — several decisions in [report.md](./report.md) only make sense against it.

**On specifics.** The findings below were established by reading the prior implementation.
Source references, file paths and internal identifiers are deliberately omitted; what is kept
is the behaviour, which is what the design argument actually rests on.

---

## 1. Where the code is

There is **one component**, not two. A single field component contains the Monaco pane and
the OpenLayers map pane side by side, and both geometry field types render it. Alongside it
sit a GeoJSON JSON Schema split one file per geometry type and combined with `oneOf`, the
form wiring that handles single versus repeated values, and server-side enums and RFC 7946
validation.

**OpenLayers is used by exactly one component in the whole web app** — this one. Cesium and
resium appear in the dependency list but serve the asset viewers, never the geometry field.
The PoC's assumption that the stack is OpenLayers + Monaco is correct.

## 2. The data flow

```
form field (keyed by field id)
  └─ value: string            ← a bare GeoJSON *geometry*, serialized
     └─ field component
        ├─ Monaco   value={current}
        │           onChange → onChange(value)
        └─ ol Map   useEffect → render(value)
                    Draw drawend → editor.setValue(json)
```

Three properties of this flow matter more than the rest:

- **The field value is a single bare geometry, not a Feature or FeatureCollection.** The draw
  handler writes `{ type, coordinates }`, the JSON Schema's `oneOf` lists only geometry
  objects, and the server rejects anything whose `type` is not a geometry type. Rendering
  wraps it in a Feature on the fly and throws the wrapper away again.
- **Repeated values are `string[]`, one geometry per entry** — a repeated field renders N
  independent field components with reorder buttons. A "multiple" Point field is *not* a
  MultiPoint; it is N separate Point values on N separate maps.
- **The map→text direction is imperative.** The draw handler calls `setValue()` directly on
  the Monaco model rather than lifting state; Monaco's own `onChange` then propagates it back
  out to the form.

## 3. Why the two editing methods are separated

**They are separated by one boolean.** A permission flag derived from the field type is passed
down and used in exactly two places: it makes the JSON pane read-only in Editor mode, and it
renders the draw toolbar only in Editor mode.

So the two field types are one component under two mutually exclusive write permissions:

|                         | Geometry **Editor**  | Geometry **Object** |
| ----------------------- | -------------------- | ------------------- |
| Draw toolbar            | shown                | hidden              |
| JSON pane               | **read-only**        | editable            |
| Who may write the value | the map              | the text            |
| Text → map rendering    | yes                  | yes                 |
| Map → text              | yes, via `Draw` only | n/a — no toolbar    |

**The separation is product design enforced by a permission flag**, not a technical limitation
and not a constraint of OpenLayers. The two panes already share one value, already live in one
component, and already sync in the text→map direction *in both modes*. What is withheld is
write access, and it is withheld symmetrically so that only one pane can ever be authoritative.

That is a defensible original decision — it sidesteps the sync problems [report.md](./report.md)
§1 describes, which are real — but nothing in the code stands in the way of removing the flag.
§1's "incompatible update models" is a correct account of *why naive bidirectional syncing
fails in general*; it is not the reason this particular separation exists.

## 4. What the existing implementation cannot do

### 4.1 An existing point cannot be moved on the map — only redrawn

`Modify`, `Translate`, `Select` and `Snap` are **never imported**. The only interaction is
`Draw`. Consequences:

- There is no vertex editing and no drag. To change a placed point you press the draw button
  again and place a new one, which **replaces the whole value**.
- Because that is destructive, it is gated behind a confirm dialog — *"This action will
  replace the previously entered value"* — with a `Do not show this again` checkbox persisted
  to `localStorage`. The dialog appears only when a value already exists.

This is the single largest gap against *"dropping or moving a point on the map"*.

### 4.2 There is no numeric latitude/longitude input

Nowhere in the field. Coordinates are reachable only by editing raw JSON — and in Geometry
Editor mode that pane is read-only, so a Geometry Editor field offers **no way at all** to
fine-tune a coordinate. Draw it again or accept where it landed.

### 4.3 Location search exists, but never touches the value

The existing search already queries the public Nominatim endpoint and then animates the view
to the first result. It **moves the camera and stops there** — the geometry is untouched, and
the user must still draw manually on the newly centred map.

So *"applying the result to a geometry field"* is the actual missing piece; "add a search box"
is already done. Four further observations on what ships today:

- `https://nominatim.openstreetmap.org/search` is called **directly from the browser** in
  production. [report.md](./report.md) §3.3 frames the public endpoint's 1 req/s policy as a
  future risk; it is a present one.
- No debounce is needed because it is a submit rather than type-ahead — but that also means no
  suggestion list: only the first result is ever used, the rest discarded.
- Failure is logged to the console only — no user-visible error or empty state.
- Zoom is derived from Nominatim's own `place_rank`, capped at 17.

### 4.4 Multi\* and GeometryCollection: accepted, rendered, never drawable

The two field types deliberately support different type sets, enforced on the server:

| Type                                        | Geometry Editor                        | Geometry Object |
| ------------------------------------------- | -------------------------------------- | --------------- |
| Point / LineString / Polygon                | yes                                    | yes             |
| MultiPoint / MultiLineString / MultiPolygon | **no**                                 | yes             |
| GeometryCollection                          | **no**                                 | yes             |
| wildcard                                    | yes — Point, LineString, Polygon only  | n/a             |

The frontend mirrors this: the Editor's supported type is a single value while the Object's is
an array, and the wildcard expands to exactly `[Point, LineString, Polygon]`.

Within Geometry Object, Multi\* and GeometryCollection values **do** render — whatever parses
is handed to `ol/format/GeoJSON` — and they are editable as text. They are simply not
producible from the map, because there is no toolbar in that mode at all.

Two smaller notes:

- `Circle` and `Rectangle` are draw *tools*, not stored types. Circle is converted with
  `fromCircle()` to a Polygon before serialization, Rectangle uses `createBox()`. Both are
  offered only under the wildcard type set.
- Positions are validated to length 2 or 3 server-side, so elevation round-trips.

### 4.5 The map layer is torn down and rebuilt on every value change

Rendering removes every layer except the base and constructs a fresh `VectorSource`,
`VectorLayer` and `Style` each time `value` changes — which in Geometry Object mode means **on
every keystroke**. Two consequences:

- It is why no `Modify` interaction could simply be added: any interaction bound to the source
  would be discarded on the next character typed.
- In Object mode the view also re-`fit`s on every change. Editor mode fits once; Object mode
  recentres the map while you type.

### 4.6 Invalid text blocks rendering, and errors surface as form validation

The error state comes from two independent sources — Monaco's own JSON Schema markers and a
separate schema check of the parsed value against the field's supported types. While set,
rendering is skipped, so the map holds its last good state. The error is lifted into the form
layer and rejects submission. This part already behaves the way the PoC does.

## 5. What unification would actually require

| Capability                             | Current state                                       | Work implied                                                              |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Drop or move a point on the map        | drop only; move = destructive redraw                | add `Modify`/`Translate`, and stop rebuilding the layer per change (§4.5) |
| Enter and fine-tune lat/lng            | absent                                              | new inspector UI + vertex addressing; nothing exists to extend            |
| Edit raw GeoJSON                       | exists, disabled half the time                      | remove the read-only gate on the text pane                                |
| Switch methods without losing geometry | not applicable today — only one method is ever live | the whole origin/revision sync problem [report.md](./report.md) §1 solves |
| Apply a search result to the value     | camera only                                         | write the result into the field, with a type-appropriate geometry         |

**On the backend side, nothing above is a constraint.** The definition for a unified geometry
field is undecided and the stored structure is expected to change, so the type enums, the
bare-geometry value shape and the `string[]` multiple-value encoding are recorded here as
*today's* behaviour, not as requirements to preserve or work to schedule.

What follows is a frontend design rule rather than a backend task list: **do not hard-code the
shape.** The supported-type list should arrive as data rather than be branched on — the prior
code compares against a wildcard literal in six separate places — and the geometry ⇄ store
conversion should live in one adapter at the store boundary, so that a change in the stored
envelope is a one-file change. See [report.md](./report.md) §3.8.

## 6. Where this leaves the PoC

The PoC remains valid and its recommendation is unchanged: the stack is confirmed to be
OpenLayers + Monaco, and OpenLayers' editing interactions are the right answer. Three
adjustments follow:

1. **The PoC models a `FeatureCollection` with multiple features; the field holds one bare
   geometry.** Porting means reconciling the two — which also removes the feature-id concern
   raised in [report.md](./report.md) §3.5, since ids never reach the stored value.
2. **`Modify` is not "already there".** §3.4 correctly says OpenLayers handles every geometry
   type, but the existing field imports only `Draw`, so map-side editing is new work rather
   than an existing capability to preserve.
3. **Search is an existing integration to redirect, not a new one to add** — including its
   existing production use of the public Nominatim endpoint.
