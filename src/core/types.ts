import type { FeatureCollection, Position } from "geojson";

/**
 * Which pane produced a commit. Consumers ignore snapshots they caused themselves,
 * which is what stops the text pane and the map from echoing edits back and forth.
 */
export enum EditOrigin {
  INITIAL = "INITIAL",
  TEXT = "TEXT",
  MAP = "MAP",
  NUMERIC = "NUMERIC",
  SEARCH = "SEARCH",
  /** A jump through the undo/redo stack rather than a fresh edit. */
  HISTORY = "HISTORY",
}

/** Values match the GeoJSON `geometry.type` strings so they compare directly. */
export enum GeometryKind {
  POINT = "Point",
  LINE_STRING = "LineString",
  POLYGON = "Polygon",
  MULTI_POINT = "MultiPoint",
  MULTI_LINE_STRING = "MultiLineString",
  MULTI_POLYGON = "MultiPolygon",
  GEOMETRY_COLLECTION = "GeometryCollection",
}

/** The geometry kinds this PoC lets you draw and modify on the map. */
export const EDITABLE_KINDS: readonly GeometryKind[] = [
  GeometryKind.POINT,
  GeometryKind.LINE_STRING,
  GeometryKind.POLYGON,
];

/** A request for the map to recentre. `nonce` makes repeat requests distinguishable. */
export interface FocusRequest {
  readonly position: Position;
  readonly nonce: number;
}

/** One restorable point in the document's history. */
export interface HistoryEntry {
  readonly collection: FeatureCollection;
  readonly selectedId: string | null;
}

export interface GeoSnapshot {
  readonly collection: FeatureCollection;
  /** Bumped only when `collection` actually changes; selection changes do not bump it. */
  readonly revision: number;
  readonly origin: EditOrigin;
  readonly selectedId: string | null;
  readonly focus: FocusRequest | null;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

/** One numerically editable position within a geometry, addressed by flat index. */
export interface VertexRef {
  readonly index: number;
  readonly position: Position;
  readonly label: string;
}

export interface ParseSuccess {
  readonly ok: true;
  readonly collection: FeatureCollection;
}

export interface ParseFailure {
  readonly ok: false;
  readonly message: string;
  /** Character offset into the source text, when the failure is locatable. */
  readonly offset: number | null;
}

export type ParseResult = ParseSuccess | ParseFailure;
