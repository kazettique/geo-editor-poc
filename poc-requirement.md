# POC Requirement

## Brief

A geo editor can edit geojson data and preview it at the same time. It will have geojson editor, map preview and text search section.

### Geojson Editor

- WHSIWYG editor
- Syntax highlight for geojson
- Autocomplete for geojson

Current usage: monaco editor

### Map Preview

- Visualize geojson data on the map
- Dropping or moving a point (or polygon) on the map

Current usage: [OpenLayer](https://www.npmjs.com/package/ol)

### Text Search

- Address and place-name search.
- Coverage and accuracy in Japan and internationally.
- Japanese and multilingual search.

Current usage: [openstreetmap](https://nominatim.openstreetmap.org/search)

### Other

- Identify any additional limitations for LineString, Polygon, Multi geometries, or GeometryCollection
- Data editing and map editing should be synced bi-directionally

### 2. Location search options

Investigate how CMS could support searching for a location by address or place name and applying the result to a Geometry field.

Evaluate realistic options, including:

- Search or geocoding capabilities offered by the current map provider.
- Using a separate geocoding or place-search service.
- Relevant commercial and open-source alternatives.

The comparison should consider:

- Address and place-name search.
- Coverage and accuracy in Japan and internationally.
- Japanese and multilingual search.
- API cost, quotas, and rate limits.
- API key handling and frontend exposure.
- Licensing, attribution, and usage restrictions.
- Integration complexity and maintenance.
- Whether the search service requires us to use the same provider for map tiles and rendering.

### 3. Suitability of the current map provider

Based on the current use cases, evaluate whether the current map provider and frontend map stack remain the most suitable option.

Distinguish between:

- Map rendering and tiles.
- Drawing and geometry-editing capabilities.
- Address and place search.

Changing one of these does not necessarily require replacing the others.

Compare the current solution with realistic alternatives and recommend whether we should:

- Keep the current provider and add a separate search service.
- Keep the provider but replace or extend the drawing and editing layer.
- Replace the current provider.
- Use different services for rendering, editing, and search.

The recommendation should consider:

- Implementation effort.
- Cost.
- Performance.
- Long-term maintenance.
- Compatibility with the existing CMS architecture.

## Technical Validation

Create a small, non-production PoC for the recommended approach, focused on a Point geometry, to validate that:

- [ ]  An existing point value can be loaded on the map.
- [ ]  The point can be placed or moved from the map.
- [ ]  Latitude and longitude can be edited numerically.
- [ ]  The map and coordinate inputs remain synchronized.
- [ ]  A location search result can be used to set or update the point.

The PoC does not need final UI design or production-ready error handling.

## Expected Output

- [ ]  A short explanation of why the current editing methods are separated.
- [ ]  Identified technical blockers, limitations, and risks.
- [ ]  A comparison of location-search and map-service options.
- [ ]  A clear recommendation with reasoning.
- [ ]  A lightweight PoC or, if blocked, a clear explanation of what prevents it.
- [ ]  A rough breakdown of the follow-up work needed for production implementation.

## Out of Scope

- Production implementation.
- Final UX or visual design.
- Migrating existing Geometry Editor and Geometry Object fields.
- Finalizing support for every GeoJSON geometry type.
