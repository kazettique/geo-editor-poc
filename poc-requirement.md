# PoC scope

What this proof of concept sets out to build, and what it deliberately leaves alone.

## Brief

A geo editor that edits GeoJSON data and previews it at the same time, with a GeoJSON
editor, a map preview and a text-search section.

### GeoJSON editor

- WYSIWYG editing
- Syntax highlighting for GeoJSON
- Autocomplete for GeoJSON

Current choice: Monaco.

### Map preview

- Visualize GeoJSON data on a map
- Drop or move a point (or polygon) on the map

Current choice: [OpenLayers](https://www.npmjs.com/package/ol).

### Text search

- Address and place-name search
- Coverage and accuracy in Japan and internationally
- Japanese and multilingual search

Current choice: [Nominatim](https://nominatim.openstreetmap.org/search).

### Other

- Identify any limitations for LineString, Polygon, Multi\* geometries or GeometryCollection
- Data editing and map editing stay synchronized bi-directionally

## Questions to answer

**Location search.** How a geometry field could support searching by address or place name
and applying the result. Worth weighing: search offered by the map provider itself, a
separate geocoding service, and commercial or open-source alternatives — against address and
place-name quality, Japanese and international coverage, cost and rate limits, API-key
handling in a browser, licensing and attribution, integration effort, and whether the search
service forces the same provider for tiles and rendering.

**Map provider suitability.** Whether the current map stack remains the right choice,
separating three concerns that can be changed independently: rendering and tiles, drawing and
geometry editing, and address search. The outcome should be a recommendation — keep the
provider and add a separate search service, keep it but replace the editing layer, replace it
outright, or use different services for each — reasoned against effort, cost, performance,
long-term maintenance, and compatibility with the existing architecture.

## Technical validation

A small, non-production PoC of the recommended approach, focused on a Point geometry,
validating that:

- [ ] An existing point value can be loaded on the map.
- [ ] The point can be placed or moved from the map.
- [ ] Latitude and longitude can be edited numerically.
- [ ] The map and coordinate inputs remain synchronized.
- [ ] A location search result can be used to set or update the point.

The PoC does not need final UI design or production-ready error handling.

## Out of scope

- Production implementation.
- Final UX or visual design.
- Migrating existing geometry field values.
- Finalizing support for every GeoJSON geometry type.
