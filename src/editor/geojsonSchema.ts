/**
 * JSON Schema handed to Monaco's JSON language service. This is what produces the
 * inline squiggles and the autocomplete — no custom language server needed.
 *
 * Deliberately separate from `core/geoSchema.ts` (zod): that one guards what enters
 * the store at runtime, this one is authoring UX. Draft-07 with `definitions` rather
 * than 2020-12 with `$defs`, because that is what Monaco's service supports best.
 */

export const GEOJSON_SCHEMA_URI = "https://geojson.org/schema/FeatureCollection.json";

const position = {
  type: "array",
  minItems: 2,
  maxItems: 3,
  items: { type: "number" },
  description: "[longitude, latitude] with optional altitude — note the lon/lat order",
};

export const GEOJSON_SCHEMA: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "GeoJSON FeatureCollection",
  type: "object",
  required: ["type", "features"],
  properties: {
    type: { const: "FeatureCollection" },
    features: { type: "array", items: { $ref: "#/definitions/feature" } },
    bbox: { $ref: "#/definitions/bbox" },
  },
  definitions: {
    position,
    bbox: {
      type: "array",
      minItems: 4,
      items: { type: "number" },
      description: "[west, south, east, north]",
    },
    feature: {
      type: "object",
      required: ["type", "geometry", "properties"],
      properties: {
        type: { const: "Feature" },
        id: {
          type: ["string", "number"],
          description: "Stable feature identity — the map diffs on this",
        },
        geometry: {
          oneOf: [{ $ref: "#/definitions/geometry" }, { type: "null" }],
        },
        properties: { type: ["object", "null"] },
        bbox: { $ref: "#/definitions/bbox" },
      },
    },
    geometry: {
      oneOf: [
        { $ref: "#/definitions/point" },
        { $ref: "#/definitions/lineString" },
        { $ref: "#/definitions/polygon" },
        { $ref: "#/definitions/multiPoint" },
        { $ref: "#/definitions/multiLineString" },
        { $ref: "#/definitions/multiPolygon" },
        { $ref: "#/definitions/geometryCollection" },
      ],
    },
    point: {
      type: "object",
      title: "Point",
      required: ["type", "coordinates"],
      properties: {
        type: { const: "Point" },
        coordinates: { $ref: "#/definitions/position" },
      },
    },
    lineString: {
      type: "object",
      title: "LineString",
      required: ["type", "coordinates"],
      properties: {
        type: { const: "LineString" },
        coordinates: { type: "array", minItems: 2, items: { $ref: "#/definitions/position" } },
      },
    },
    linearRing: {
      type: "array",
      minItems: 4,
      items: { $ref: "#/definitions/position" },
      description: "Closed ring — the last position must repeat the first",
    },
    polygon: {
      type: "object",
      title: "Polygon",
      required: ["type", "coordinates"],
      properties: {
        type: { const: "Polygon" },
        coordinates: {
          type: "array",
          items: { $ref: "#/definitions/linearRing" },
          description: "First ring is the exterior, any further rings are holes",
        },
      },
    },
    multiPoint: {
      type: "object",
      title: "MultiPoint",
      required: ["type", "coordinates"],
      properties: {
        type: { const: "MultiPoint" },
        coordinates: { type: "array", items: { $ref: "#/definitions/position" } },
      },
    },
    multiLineString: {
      type: "object",
      title: "MultiLineString",
      required: ["type", "coordinates"],
      properties: {
        type: { const: "MultiLineString" },
        coordinates: {
          type: "array",
          items: { type: "array", minItems: 2, items: { $ref: "#/definitions/position" } },
        },
      },
    },
    multiPolygon: {
      type: "object",
      title: "MultiPolygon",
      required: ["type", "coordinates"],
      properties: {
        type: { const: "MultiPolygon" },
        coordinates: {
          type: "array",
          items: { type: "array", items: { $ref: "#/definitions/linearRing" } },
        },
      },
    },
    geometryCollection: {
      type: "object",
      title: "GeometryCollection",
      required: ["type", "geometries"],
      properties: {
        type: { const: "GeometryCollection" },
        geometries: { type: "array", items: { $ref: "#/definitions/geometry" } },
      },
    },
  },
};
