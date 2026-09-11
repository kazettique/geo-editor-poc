import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { featureCollectionSchema } from "./geoSchema";
import { EDITABLE_KINDS, GeometryKind, type ParseResult, type VertexRef } from "./types";

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

  /** Degrees moved when a conversion or an insert needs a position it cannot derive. */
  public static readonly VERTEX_STEP = 0.002;

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
   *
   * `limit` stops the walk early. A form cannot usefully show thousands of rows, and
   * building a ref for every one of them on every commit is the expensive half.
   */
  public static listVertices(geometry: Geometry, limit?: number): VertexRef[] {
    if (geometry.type === GeometryKind.POINT) {
      return [{ index: 0, position: geometry.coordinates, label: "Coordinate" }];
    }
    if (geometry.type === GeometryKind.LINE_STRING) {
      return geometry.coordinates
        .slice(0, limit)
        .map((position: Position, index: number) => ({
          index,
          position,
          label: `Vertex ${String(index + 1)}`,
        }));
    }
    if (geometry.type === GeometryKind.POLYGON) {
      const refs: VertexRef[] = [];
      const multiRing: boolean = geometry.coordinates.length > 1;
      for (const [ringIndex, ring] of geometry.coordinates.entries()) {
        for (const [index, position] of ring.slice(0, -1).entries()) {
          if (limit !== undefined && refs.length >= limit) return refs;
          refs.push({
            index: refs.length,
            position,
            label: multiRing
              ? `Ring ${String(ringIndex + 1)} · Vertex ${String(index + 1)}`
              : `Vertex ${String(index + 1)}`,
          });
        }
      }
      return refs;
    }
    return [];
  }

  /** How many vertices `listVertices` would yield uncapped, without allocating any. */
  public static countVertices(geometry: Geometry): number {
    if (geometry.type === GeometryKind.POINT) return 1;
    if (geometry.type === GeometryKind.LINE_STRING) return geometry.coordinates.length;
    if (geometry.type === GeometryKind.POLYGON) {
      return geometry.coordinates.reduce(
        (total: number, ring: Position[]) => total + ring.length - 1,
        0,
      );
    }
    return 0;
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

  /**
   * Every position a user may address, in document order, with polygon rings' closing
   * position dropped because it only repeats the ring's first. Unlike `listVertices` this
   * covers the Multi* and GeometryCollection kinds, which is what lets one be converted
   * down into an editable geometry rather than being a dead end.
   */
  public static flattenPositions(geometry: Geometry): Position[] {
    if (geometry.type === GeometryKind.GEOMETRY_COLLECTION) {
      return geometry.geometries.flatMap((entry: Geometry) => GeoUtils.flattenPositions(entry));
    }
    if (geometry.type === GeometryKind.POINT) return [geometry.coordinates];
    if (geometry.type === GeometryKind.POLYGON) {
      return geometry.coordinates.flatMap((ring: Position[]) => ring.slice(0, -1));
    }
    if (geometry.type === GeometryKind.MULTI_POLYGON) {
      return geometry.coordinates.flatMap((polygon: Position[][]) =>
        polygon.flatMap((ring: Position[]) => ring.slice(0, -1)),
      );
    }
    if (geometry.type === GeometryKind.MULTI_LINE_STRING) return geometry.coordinates.flat();
    // LineString and MultiPoint both carry a flat list already.
    return [...geometry.coordinates];
  }

  /**
   * One step east of `position`, turning back at the antimeridian. Keeps a newly added
   * feature off the exact pixel of the last one, where nothing would distinguish them.
   */
  public static offset(position: Position): Position {
    return [GeoUtils.step(position[0], 180), position[1]];
  }

  /** A geometry of `kind` seeded at one position, for a feature that has none yet. */
  public static createGeometry(kind: GeometryKind, anchor: Position): Geometry {
    return GeoUtils.buildGeometry(kind, [anchor]);
  }

  /**
   * Rebuilds `geometry` as `kind`, reusing its positions in document order. A target that
   * holds fewer than the source has drops the surplus, which is why callers are expected
   * to warn first — see `isLossyConversion`.
   */
  public static convertGeometry(geometry: Geometry, kind: GeometryKind): Geometry {
    // Nothing meaningful to build for the Multi* and GeometryCollection kinds: this PoC
    // only ever converts toward an editable one.
    if (!EDITABLE_KINDS.includes(kind) || geometry.type === kind) return geometry;
    return GeoUtils.buildGeometry(kind, GeoUtils.flattenPositions(geometry));
  }

  /**
   * How many of `source`'s positions `converted` no longer carries. Compared by value
   * rather than by count, because a conversion can derive new positions while discarding
   * real ones — a count alone would report that as no loss at all.
   */
  public static droppedPositions(source: Geometry, converted: Geometry): number {
    const before: Position[] = GeoUtils.flattenPositions(source);
    const after: Position[] = GeoUtils.flattenPositions(converted);
    const kept = new Set<string>(after.map((position: Position) => String(position)));
    const missing: number = before.filter(
      (position: Position) => !kept.has(String(position)),
    ).length;
    // Repeated positions collapse into one Set entry, so a bare drop in count still counts.
    return Math.max(missing, before.length - after.length);
  }

  /**
   * Inserts a position after `index`, midway to its successor. A polygon vertex always
   * has one — the closing position repeats the ring's first — so only a LineString's
   * final vertex needs a synthesised neighbour to aim at.
   */
  public static insertVertex(geometry: Geometry, index: number): Geometry {
    if (geometry.type === GeometryKind.LINE_STRING) {
      const coordinates: Position[] = [...geometry.coordinates];
      coordinates.splice(
        index + 1,
        0,
        GeoUtils.between(coordinates[index], coordinates[index + 1]),
      );
      return { ...geometry, coordinates };
    }
    if (geometry.type === GeometryKind.POLYGON) {
      let cursor = 0;
      const coordinates: Position[][] = geometry.coordinates.map((ring: Position[]) => {
        const editable: number = ring.length - 1;
        const local: number = index - cursor;
        cursor += editable;
        if (local < 0 || local >= editable) return ring;

        const next: Position[] = [...ring];
        next.splice(local + 1, 0, GeoUtils.between(ring[local], ring[local + 1]));
        return next;
      });
      return { ...geometry, coordinates };
    }
    return geometry;
  }

  public static removeVertex(geometry: Geometry, index: number): Geometry {
    if (!GeoUtils.canRemoveVertex(geometry, index)) return geometry;

    if (geometry.type === GeometryKind.LINE_STRING) {
      return {
        ...geometry,
        coordinates: geometry.coordinates.filter((_: Position, i: number) => i !== index),
      };
    }
    if (geometry.type === GeometryKind.POLYGON) {
      let cursor = 0;
      const coordinates: Position[][] = geometry.coordinates.map((ring: Position[]) => {
        const editable: number = ring.length - 1;
        const local: number = index - cursor;
        cursor += editable;
        if (local < 0 || local >= editable) return ring;

        const next: Position[] = ring.filter((_: Position, i: number) => i !== local);
        // Dropping a ring's first position has to drag its closing position along, or the
        // ring stops being closed and the polygon becomes invalid GeoJSON.
        if (local === 0) next[next.length - 1] = next[0];
        return next;
      });
      return { ...geometry, coordinates };
    }
    return geometry;
  }

  /** A LineString needs two positions and a linear ring three, so the last few are fixed. */
  public static canRemoveVertex(geometry: Geometry, index: number): boolean {
    if (geometry.type === GeometryKind.LINE_STRING) return geometry.coordinates.length > 2;
    if (geometry.type === GeometryKind.POLYGON) {
      let cursor = 0;
      for (const ring of geometry.coordinates) {
        const editable: number = ring.length - 1;
        if (index < cursor + editable) return editable > 3;
        cursor += editable;
      }
    }
    return false;
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

  private static buildGeometry(kind: GeometryKind, positions: readonly Position[]): Geometry {
    const anchor: Position = positions[0] ?? GeoUtils.DEFAULT_CENTER;

    if (kind === GeometryKind.LINE_STRING) {
      const coordinates: Position[] =
        positions.length >= 2 ? [...positions] : [anchor, GeoUtils.between(anchor, undefined)];
      return { type: GeometryKind.LINE_STRING, coordinates };
    }

    if (kind === GeometryKind.POLYGON) {
      if (positions.length === 2) {
        // Derive a third corner rather than fall back to a seeded square, which would
        // throw the second position away without the caller ever seeing a loss. Offset
        // along whichever axis the segment varies less, so the ring always has area.
        const [a, b] = positions;
        const apex: Position =
          Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])
            ? [b[0], GeoUtils.step(b[1], 90)]
            : [GeoUtils.step(b[0], 180), b[1]];
        return { type: GeometryKind.POLYGON, coordinates: [[a, b, apex, a]] };
      }
      const ring: Position[] = positions.length >= 3 ? [...positions] : GeoUtils.ring(anchor);
      return { type: GeometryKind.POLYGON, coordinates: [[...ring, ring[0]]] };
    }

    return { type: GeometryKind.POINT, coordinates: anchor };
  }

  private static between(a: Position, b: Position | undefined): Position {
    if (!b) return GeoUtils.offset(a);
    const midpoint: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Altitude only survives when both ends carry one; otherwise there is nothing to
    // interpolate between and inventing a value would be worse than dropping it.
    if (a.length > 2 && b.length > 2) midpoint.push((a[2] + b[2]) / 2);
    return midpoint;
  }

  /** Four distinct corners of a small square, for a ring with nothing to build from. */
  private static ring(anchor: Position): Position[] {
    const east: number = GeoUtils.step(anchor[0], 180);
    const north: number = GeoUtils.step(anchor[1], 90);
    return [anchor, [east, anchor[1]], [east, north], [anchor[0], north]];
  }

  /** One step along an axis, turning back rather than crossing the axis limit. */
  private static step(value: number, limit: number): number {
    const next: number = value + GeoUtils.VERTEX_STEP;
    return next <= limit ? next : value - GeoUtils.VERTEX_STEP;
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
