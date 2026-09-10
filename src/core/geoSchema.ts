import { z } from "zod";
import type { Geometry } from "geojson";
import { GeometryKind } from "./types";

/** [lon, lat] or [lon, lat, alt]. */
const positionSchema = z.array(z.number()).min(2).max(3);

const pointSchema = z.object({
  type: z.literal(GeometryKind.POINT),
  coordinates: positionSchema,
});

const lineStringSchema = z.object({
  type: z.literal(GeometryKind.LINE_STRING),
  coordinates: z.array(positionSchema).min(2),
});

const polygonSchema = z.object({
  type: z.literal(GeometryKind.POLYGON),
  // A linear ring needs 4 positions because the last one repeats the first.
  coordinates: z.array(z.array(positionSchema).min(4)),
});

const multiPointSchema = z.object({
  type: z.literal(GeometryKind.MULTI_POINT),
  coordinates: z.array(positionSchema),
});

const multiLineStringSchema = z.object({
  type: z.literal(GeometryKind.MULTI_LINE_STRING),
  coordinates: z.array(z.array(positionSchema).min(2)),
});

const multiPolygonSchema = z.object({
  type: z.literal(GeometryKind.MULTI_POLYGON),
  coordinates: z.array(z.array(z.array(positionSchema).min(4))),
});

// Lazy because a GeometryCollection may contain further GeometryCollections.
export const geometrySchema: z.ZodType<Geometry> = z.lazy(() =>
  z.union([
    pointSchema,
    lineStringSchema,
    polygonSchema,
    multiPointSchema,
    multiLineStringSchema,
    multiPolygonSchema,
    geometryCollectionSchema,
  ]),
);

const geometryCollectionSchema = z.object({
  type: z.literal(GeometryKind.GEOMETRY_COLLECTION),
  geometries: z.array(geometrySchema),
});

const featureSchema = z.object({
  type: z.literal("Feature"),
  id: z.union([z.string(), z.number()]).optional(),
  geometry: geometrySchema.nullable(),
  properties: z.record(z.string(), z.unknown()).nullish(),
});

export const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema),
});
