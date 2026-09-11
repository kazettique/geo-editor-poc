# How Re:Earth CMS edits geometry today

Answers Investigation Area 1 of the research brief — the section that was dropped when
`poc-requirement.md` was derived from it, and which [report.md](./report.md) §1 could only
answer generically.

**Source of truth.** Everything below was read from `reearth-cms` at commit `5cb0cbf82`,
not inferred. File references are repo-relative to that checkout. Where this document
contradicts `report.md`, this one is the grounded version.

---

## 1. Where the code is

There is **one component**, not two. `web/src/components/molecules/Common/Form/GeometryItem/index.tsx`
(744 lines) contains the Monaco pane and the OpenLayers map pane side by side, and both
Geometry field types render it.

| Concern                                                       | Location                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| The field UI — both panes                                     | `Common/Form/GeometryItem/index.tsx`                                  |
| GeoJSON JSON Schema, one file per type, combined with `oneOf` | `Common/Form/GeometryItem/schema/`                                    |
| Form wiring, single vs multiple, validation                   | `Content/Form/fields/FieldComponents/GeometryField.tsx`               |
| Repeated values (`field.multiple`)                            | `Common/MultiValueField/MultiValueGeometry/index.tsx`                 |
| Schema-editor defaults                                        | `Schema/FieldModal/FieldDefaultInputs/GeometryField/index.tsx`        |
| Server-side type enums                                        | `server/pkg/schema/field_geometry_{editor,object}_supported_types.go` |
| Server-side RFC 7946 validation                               | `server/pkg/schema/field_geometry_validation.go`                      |

**`ol` is used by exactly one component in the whole web app** — this one. Cesium/resium
appear in `package.json` but only serve the asset viewers (`Asset/Viewers/*`), never the
Geometry field. The PoC's assumption that the current stack is OpenLayers + Monaco is
correct.

## 2. The data flow

```
antd Form.Item (name = field.id)
  └─ value: string            ← a bare GeoJSON *geometry*, serialized
     └─ GeometryItem
        ├─ Monaco   value={currentValue}          (:531)
        │           onChange → onChange(value)    (:250-256)
        └─ ol Map   useEffect → sketch(value)     (:471-478)
                    Draw drawend → editorRef.setValue(json)  (:107-121)
```

Three properties of this flow matter more than the rest:

- **The field value is a single bare geometry, not a Feature or FeatureCollection.**
  `drawend` writes `{ type, coordinates }` (`:118`), the JSON Schema's `oneOf` lists only
  geometry objects (`schema/index.ts:9-19`), and the server rejects anything whose `type`
  is not a geometry type (`field_geometry_validation.go:27-46`). Rendering wraps it in a
  Feature on the fly (`:410-422`) and throws the wrapper away again.
- **Repeated values are `string[]`, one geometry per entry** — `MultiValueGeometry`
  renders N independent `GeometryItem`s with reorder buttons. A "multiple" Point field is
  *not* a MultiPoint; it is N separate Point values on N separate maps.
- **The map→text direction is imperative.** `drawend` calls `editorRef.current.setValue()`
  directly on the Monaco model rather than lifting state; Monaco's own `onChange` then
  propagates it back out to the form.

## 3. Why the two editing methods are separated

**They are separated by one boolean.** `GeometryField.tsx:36` computes
`isEditor = field.type === "GeometryEditor"` and passes it down. `GeometryItem` then uses
it in exactly two places:

| Line   | Effect                                                                             |
| ------ | ---------------------------------------------------------------------------------- |
| `:144` | `readOnly: disabled \|\| isEditor` — in **Editor** mode the JSON pane is read-only |
| `:551` | `{isEditor && !disabled && …}` — the draw toolbar renders **only** in Editor mode  |

So the two field types are one component under two mutually exclusive write permissions:

|                         | Geometry **Editor**  | Geometry **Object** |
| ----------------------- | -------------------- | ------------------- |
| Draw toolbar            | shown                | hidden              |
| JSON pane               | **read-only**        | editable            |
| Who may write the value | the map              | the text            |
| Text → map rendering    | yes (`:471-478`)     | yes (`:471-478`)    |
| Map → text              | yes, via `Draw` only | n/a — no toolbar    |

**Answer to the brief's question:** the separation is **product design enforced by a
permission flag**, not a technical limitation and not a constraint of OpenLayers. The two
panes already share one value, already live in one component, and already sync in the
text→map direction *in both modes*. What is withheld is write access, and it is withheld
symmetrically so that only one pane can ever be authoritative.

That is a defensible original decision — it sidesteps the sync problems `report.md` §1
describes, which are real — but nothing in the current code stands in the way of removing
the flag. `report.md` §1's "incompatible update models" is a correct account of *why
naive bidirectional syncing fails in general*; it is not the reason CMS did this.

## 4. What the current implementation cannot do

These are the gaps against the brief's list of required capabilities, all verified in the
source rather than by guessing.

### 4.1 An existing point cannot be moved on the map — only redrawn

`Modify`, `Translate`, `Select` and `Snap` are **never imported**. The only interaction is
`Draw` (`:14`). Consequences:

- There is no vertex editing and no drag. To change a placed point you press the draw
  button again and place a new one, which **replaces the whole value**.
- Because that is destructive, it is gated behind a confirm dialog — *"This action will
  replace the previously entered value"* (`:349-377`) — with a `Do not show this again`
  checkbox persisted to `localStorage` under `disableGeometryWarning` (`:46`, `:358-367`).
- `sketchButtonClick` (`:379-390`) shows the dialog only when a value already exists.

This is the single largest gap against the brief's *"dropping or moving a point on the
map"*, and `report.md` does not mention it.

### 4.2 There is no numeric latitude/longitude input

Nowhere in the field. Coordinates are reachable only by editing raw JSON — and in Geometry
Editor mode that pane is read-only, so a Geometry Editor field offers **no way at all** to
fine-tune a coordinate. Draw it again or accept where it landed.

### 4.3 Location search exists, but never touches the value

`handleSearch` (`:328-347`) already queries the public Nominatim endpoint through axios and
then calls `view.animate()` with the first result. It **moves the camera and stops there** —
the geometry is untouched, and the user must still draw manually on the newly centred map.

So the brief's *"applying the result to a Geometry field"* is the actual missing piece;
"add a search box" is already done. Four further observations on what is shipping:

- `https://nominatim.openstreetmap.org/search` is called **directly from the browser** in
  production. `report.md` §3.3 frames the public endpoint's 1 req/s policy as a future
  risk; it is a present one.
- No debounce is needed because it is an antd `Search` submit, not type-ahead — but that
  also means no suggestion list: only `data[0]` is ever used, the rest is discarded.
- Failure is `console.error` only (`:342-344`) — no user-visible error or empty state.
- Zoom is `Math.min(data[0].place_rank, 17)`, i.e. Nominatim's rank reused as a zoom level.

### 4.4 Multi\* and GeometryCollection: accepted, rendered, never drawable

The two field types deliberately support different type sets, and the split is enforced on
the server:

| Type                                        | Geometry Editor                       | Geometry Object |
| ------------------------------------------- | ------------------------------------- | --------------- |
| Point / LineString / Polygon                | yes                                   | yes             |
| MultiPoint / MultiLineString / MultiPolygon | **no**                                | yes             |
| GeometryCollection                          | **no**                                | yes             |
| `ANY`                                       | yes — Point, LineString, Polygon only | n/a             |

`field_geometry_editor_supported_types.go:8-11` vs `field_geometry_object_supported_types.go:8-14`.
The frontend mirrors this: `editorSupportedTypes?.[0]` is a single value while
`objectSupportedTypes` is an array (`GeometryField.tsx:31-34`), and `ANY` expands to exactly
`[Point, LineString, Polygon]` (`:232`).

Within Geometry Object, Multi\* and GeometryCollection values **do** render — `sketch()`
passes whatever parses to `ol/format/GeoJSON` — and they are editable as text. They are
simply not producible from the map, because there is no toolbar in that mode at all.

Two smaller notes:

- `Circle` and `Rectangle` are draw *tools*, not stored types. Circle is converted with
  `fromCircle()` to a Polygon before serialization (`:111-114`), Rectangle uses
  `createBox()`. Both are offered only when `supportedTypes === "ANY"` (`:580-597`).
- Positions are validated to length 2 or 3 server-side (`isValidPosition`), so elevation
  round-trips.

### 4.5 The map layer is torn down and rebuilt on every value change

`sketch()` removes every layer except index 0 and constructs a fresh `VectorSource`,
`VectorLayer` and `Style` (`:426-466`) each time `value` changes — which in Geometry Object
mode means **on every keystroke**. Two consequences:

- It is why no `Modify` interaction could simply be added: any interaction bound to the
  source would be discarded on the next character typed.
- In Object mode the view also re-`fit`s on every change, because the guard is
  `isInitRef.current || !isEditor` (`:454`). Editor mode fits once; Object mode recentres
  the map while you type.

### 4.6 Invalid text blocks rendering, and errors surface as form validation

`hasError` comes from two independent sources — Monaco's own JSON Schema markers
(`:207-218`) and an ajv check of the parsed value against the field's supported types
(`:220-248`). While set, `sketch()` is skipped (`:473`), so the map holds its last good
state. The error is lifted into antd through an `errorSet` in `GeometryField.tsx:21-29`
and rejects form submission (`:48-51`). This part already behaves the way the PoC does.

## 5. What unification would actually require

Mapping the brief's four capabilities onto the code above:

| Capability                             | Current state                                       | Work implied                                                              |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Drop or move a point on the map        | drop only; move = destructive redraw                | add `Modify`/`Translate`, and stop rebuilding the layer per change (§4.5) |
| Enter and fine-tune lat/lng            | absent                                              | new inspector UI + vertex addressing; nothing exists to extend            |
| Edit raw GeoJSON                       | exists, disabled half the time                      | delete the `isEditor` read-only gate (`:144`)                             |
| Switch methods without losing geometry | not applicable today — only one method is ever live | the whole origin/revision sync problem `report.md` §1 solves              |
| Apply a search result to the value     | camera only                                         | write the result into the field, with a type-appropriate geometry         |

**On the backend side, nothing above is a constraint.** The definition for a unified
Geometry field is undecided and the stored structure is expected to change, so the two Go
enums, the bare-geometry value shape and the `string[]` multiple-value encoding are
recorded here as *today's* behaviour, not as requirements to preserve or work to schedule.

What follows from that is a frontend design rule rather than a backend task list: **do not
hard-code the shape.** Specifically, the supported-type list should arrive as data rather
than be branched on — the current code compares against the literal `"ANY"` in six places
(`:231`, `:553`, `:562`, `:571`, `:580`, `:589`) plus a `GEO_TYPE_MAP` entry (`:56`) — and
the geometry ⇄ store conversion should live in one adapter at the store boundary so that a
change in the stored envelope is a one-file change. See [report.md](./report.md) §3.8.

## 6. Where this leaves the PoC

The PoC remains valid and its recommendation is unchanged: the stack is confirmed to be
OpenLayers + Monaco, and `ol`'s editing interactions are the right answer. Three
adjustments follow from this review:

1. **The PoC models a `FeatureCollection` with multiple features; the CMS field holds one
   bare geometry.** Porting means collapsing the store to a single geometry — which also
   removes the feature-id concern raised in `report.md` §3.5, since ids never reach the
   stored value.
2. **`Modify` is not "already there" in CMS.** `report.md` §3.4 correctly says ol handles
   every geometry type, but the current field imports only `Draw`, so map-side editing is
   new work rather than an existing capability to preserve.
3. **Search is an existing integration to redirect, not a new one to add** — including its
   existing production use of the public Nominatim endpoint.
