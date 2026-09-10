import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { featureCollectionSchema } from "./geoSchema";
import { GeometryKind, type ParseResult, type VertexRef } from "./types";

export abstract class GeoUtils {
  /**
   * ~1cm. Without a fixed precision the EPSG:3857 round-trip returns 15-digit
   * floats that never equal what is in the text pane, so the two panes would
   * rewrite each other forever.
   */
  public static readonly COORDINATE_PRECISION = 7;

  /** Tokyo Station. */
  public static readonly DEFAULT_CENTER: Position = [139.767125, 35.681236];

  public static readonly DEFAULT_ZOOM = 15;

  private static readonly ID_PATTERN = /^f(\d+)$/;

  public static round(value: number): number {
    const factor = 10 ** GeoUtils.COORDINATE_PRECISION;
    return Math.round(value * factor) / factor;
  }

  public static roundGeometry(geometry: Geometry): Geometry {
    if (geometry.type === GeometryKind.GEOMETRY_COLLECTION) {
      return {
        ...geometry,
        geometries: geometry.geometries.map((entry: Geometry) => GeoUtils.roundGeometry(entry)),
      };
    }
    return {
      ...geometry,
      coordinates: GeoUtils.roundNested(geometry.coordinates),
    } as Geometry;
  }

  /**
   * Canonical form for anything entering the store: every feature carries a stable
   * string id (the map diffs on it) and every coordinate is rounded.
   */
  public static normalize(collection: FeatureCollection): FeatureCollection {
    let counter = GeoUtils.highestIdSuffix(collection);
    const features: Feature[] = collection.features.map((feature: Feature) => {
      const id: string =
        typeof feature.id === "string" || typeof feature.id === "number"
          ? String(feature.id)
          : `f${String(++counter)}`;
      return {
        ...feature,
        id,
        geometry: feature.geometry ? GeoUtils.roundGeometry(feature.geometry) : feature.geometry,
        properties: feature.properties ?? {},
      };
    });
    return { type: "FeatureCollection", features };
  }

  public static parse(text: string): ParseResult {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      const message: string = error instanceof Error ? error.message : "Invalid JSON";
      return { ok: false, message, offset: GeoUtils.offsetFromJsonError(message) };
    }

    const result = featureCollectionSchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path: string = issue.path.join(".");
      return {
        ok: false,
        message: path ? `${path}: ${issue.message}` : issue.message,
        offset: null,
      };
    }
    return { ok: true, collection: result.data as FeatureCollection };
  }

  public static stringify(collection: FeatureCollection): string {
    return JSON.stringify(collection, null, 2);
  }

  /**
   * Structural comparison used to drop no-op commits. Cheap and good enough here
   * because everything in the store has already been through `normalize`.
   */
  public static isEqual(a: FeatureCollection, b: FeatureCollection): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  public static findFeature(collection: FeatureCollection, id: string | null): Feature | null {
    if (id === null) return null;
    return collection.features.find((feature: Feature) => String(feature.id) === id) ?? null;
  }

  public static nextFeatureId(collection: FeatureCollection): string {
    return `f${String(GeoUtils.highestIdSuffix(collection) + 1)}`;
  }

  /** First coordinate of any geometry — used to centre the map on a selection. */
  public static firstPosition(geometry: Geometry | null): Position | null {
    if (!geometry) return null;
    if (geometry.type === GeometryKind.GEOMETRY_COLLECTION) {
      for (const entry of geometry.geometries) {
        const position: Position | null = GeoUtils.firstPosition(entry);
        if (position) return position;
      }
      return null;
    }
    return GeoUtils.firstNested(geometry.coordinates);
  }

  /**
   * The positions a user may edit numerically. A polygon ring's final position is
   * excluded because it only repeats the first — it is kept in step by `setVertex`.
   */
  public static listVertices(geometry: Geometry): VertexRef[] {
    if (geometry.type === GeometryKind.POINT) {
      return [{ index: 0, position: geometry.coordinates, label: "Coordinate" }];
    }
    if (geometry.type === GeometryKind.LINE_STRING) {
      return geometry.coordinates.map((position: Position, index: number) => ({
        index,
        position,
        label: `Vertex ${String(index + 1)}`,
      }));
    }
    if (geometry.type === GeometryKind.POLYGON) {
      const refs: VertexRef[] = [];
      const multiRing: boolean = geometry.coordinates.length > 1;
      geometry.coordinates.forEach((ring: Position[], ringIndex: number) => {
        ring.slice(0, -1).forEach((position: Position, index: number) => {
          refs.push({
            index: refs.length,
            position,
            label: multiRing
              ? `Ring ${String(ringIndex + 1)} · Vertex ${String(index + 1)}`
              : `Vertex ${String(index + 1)}`,
          });
        });
      });
      return refs;
    }
    return [];
  }

  public static setVertex(geometry: Geometry, index: number, position: Position): Geometry {
    if (geometry.type === GeometryKind.POINT) {
      return index === 0 ? { ...geometry, coordinates: position } : geometry;
    }
    if (geometry.type === GeometryKind.LINE_STRING) {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((existing: Position, i: number) =>
          i === index ? position : existing,
        ),
      };
    }
    if (geometry.type === GeometryKind.POLYGON) {
      let cursor = 0;
      const coordinates: Position[][] = geometry.coordinates.map((ring: Position[]) => {
        const editable: number = ring.length - 1;
        const local: number = index - cursor;
        cursor += editable;
        if (local < 0 || local >= editable) return ring;

        const next: Position[] = ring.map((existing: Position, i: number) =>
          i === local ? position : existing,
        );
        // Moving a ring's first position must move its closing position too, or the
        // ring stops being closed and the polygon becomes invalid GeoJSON.
        if (local === 0) next[next.length - 1] = position;
        return next;
      });
      return { ...geometry, coordinates };
    }
    return geometry;
  }

  public static countPositions(geometry: Geometry): number {
    if (geometry.type === GeometryKind.GEOMETRY_COLLECTION) {
      return geometry.geometries.reduce(
        (total: number, entry: Geometry) => total + GeoUtils.countPositions(entry),
        0,
      );
    }
    return GeoUtils.countNested(geometry.coordinates);
  }

  public static isEditableKind(geometry: Geometry | null): boolean {
    if (!geometry) return false;
    return (
      geometry.type === GeometryKind.POINT ||
      geometry.type === GeometryKind.LINE_STRING ||
      geometry.type === GeometryKind.POLYGON
    );
  }

  private static highestIdSuffix(collection: FeatureCollection): number {
    return collection.features.reduce((highest: number, feature: Feature) => {
      const match = GeoUtils.ID_PATTERN.exec(String(feature.id ?? ""));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
  }

  private static roundNested(value: unknown): unknown {
    if (typeof value === "number") return GeoUtils.round(value);
    if (Array.isArray(value)) return value.map((entry: unknown) => GeoUtils.roundNested(entry));
    return value;
  }

  private static countNested(value: unknown): number {
    if (!Array.isArray(value) || value.length === 0) return 0;
    if (typeof value[0] === "number") return 1;
    return (value as unknown[]).reduce(
      (total: number, entry: unknown) => total + GeoUtils.countNested(entry),
      0,
    );
  }

  private static firstNested(value: unknown): Position | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    if (typeof value[0] === "number") return value as Position;
    return GeoUtils.firstNested(value[0]);
  }

  private static offsetFromJsonError(message: string): number | null {
    const match = /position (\d+)/.exec(message);
    return match ? Number(match[1]) : null;
  }
}
