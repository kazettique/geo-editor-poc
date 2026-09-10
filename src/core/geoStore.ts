import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { GeoUtils } from "./GeoUtils";
import { EditOrigin, GeometryKind, type GeoSnapshot, type HistoryEntry } from "./types";

/** Seeded so the PoC opens with an existing point already loaded on the map. */
export const INITIAL_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "f1",
      geometry: { type: GeometryKind.POINT, coordinates: GeoUtils.DEFAULT_CENTER },
      properties: { name: "東京駅" },
    },
  ],
};

/** Each entry holds a whole collection, so the stack is bounded rather than unbounded. */
const HISTORY_LIMIT = 100;

/**
 * Edits that arrive in bursts while the user works through one intent get folded into
 * a single entry, so undo steps back over a typed word rather than a debounce tick.
 */
const COALESCE_WINDOW_MS = 600;

const COALESCING_ORIGINS: ReadonlySet<EditOrigin> = new Set<EditOrigin>([
  EditOrigin.TEXT,
  EditOrigin.NUMERIC,
]);

export interface GeometryUpdate {
  readonly featureId: string;
  readonly geometry: Geometry;
}

export interface GeoStore {
  getSnapshot(): GeoSnapshot;
  subscribe(listener: () => void): () => void;
  commit(collection: FeatureCollection, origin: EditOrigin): void;
  setGeometry(featureId: string, geometry: Geometry, origin: EditOrigin): void;
  /** Batched so one map gesture produces exactly one revision. */
  setGeometries(updates: readonly GeometryUpdate[], origin: EditOrigin): void;
  addFeature(geometry: Geometry, origin: EditOrigin): string;
  removeFeature(featureId: string, origin: EditOrigin): void;
  select(featureId: string | null): void;
  /** Ask the map to recentre — view state, so it does not touch `revision`. */
  focus(position: Position): void;
  undo(): void;
  redo(): void;
  /**
   * Map gestures mutate ol geometries in place and only commit when they end, so a
   * history jump mid-drag would be overwritten by the gesture's own end event.
   */
  beginGesture(): void;
  endGesture(): void;
}

export function createGeoStore(initial: FeatureCollection): GeoStore {
  const listeners = new Set<() => void>();

  let snapshot: GeoSnapshot = {
    collection: GeoUtils.normalize(initial),
    revision: 1,
    origin: EditOrigin.INITIAL,
    selectedId: null,
    focus: null,
    undoDepth: 0,
    redoDepth: 0,
  };

  const past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  let lastEntryOrigin: EditOrigin | null = null;
  let lastEntryAt = 0;
  let gesturing = false;

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const currentEntry = (): HistoryEntry => ({
    collection: snapshot.collection,
    selectedId: snapshot.selectedId,
  });

  /**
   * Records the state we are about to leave. A coalescing burst deliberately does not
   * push: whatever is already on top of `past` is the state from before the burst
   * started, which is exactly where undo should land.
   */
  const pushHistory = (origin: EditOrigin): void => {
    const now: number = Date.now();
    const coalesces: boolean =
      past.length > 0 &&
      origin === lastEntryOrigin &&
      COALESCING_ORIGINS.has(origin) &&
      now - lastEntryAt < COALESCE_WINDOW_MS;

    if (!coalesces) {
      past.push(currentEntry());
      if (past.length > HISTORY_LIMIT) past.shift();
    }
    lastEntryOrigin = origin;
    lastEntryAt = now;
    future = [];
  };

  /** Expects an already-normalized collection that genuinely differs from the current one. */
  const commitState = (
    normalized: FeatureCollection,
    origin: EditOrigin,
    selectedId: string | null,
  ): void => {
    snapshot = {
      ...snapshot,
      collection: normalized,
      revision: snapshot.revision + 1,
      origin,
      selectedId: GeoUtils.findFeature(normalized, selectedId) !== null ? selectedId : null,
      undoDepth: past.length,
      redoDepth: future.length,
    };
    emit();
  };

  const publish = (collection: FeatureCollection, origin: EditOrigin): void => {
    const normalized: FeatureCollection = GeoUtils.normalize(collection);
    // Drop no-op commits so an edit that round-trips back to identical data dies
    // here instead of bouncing between the panes.
    if (GeoUtils.isEqual(normalized, snapshot.collection)) return;

    // Before commitState, so the snapshot it emits carries the new depths.
    pushHistory(origin);
    commitState(normalized, origin, snapshot.selectedId);
  };

  const setGeometries = (updates: readonly GeometryUpdate[], origin: EditOrigin): void => {
    if (updates.length === 0) return;
    const byId = new Map<string, Geometry>(
      updates.map((update: GeometryUpdate) => [update.featureId, update.geometry]),
    );
    const features: Feature[] = snapshot.collection.features.map((feature: Feature) => {
      const geometry: Geometry | undefined = byId.get(String(feature.id));
      return geometry ? { ...feature, geometry } : feature;
    });
    publish({ type: "FeatureCollection", features }, origin);
  };

  const travel = (from: HistoryEntry[], to: HistoryEntry[]): void => {
    if (gesturing) return;
    const entry: HistoryEntry | undefined = from.pop();
    if (!entry) return;
    to.push(currentEntry());
    // A burst must never coalesce across a history jump.
    lastEntryOrigin = null;
    commitState(entry.collection, EditOrigin.HISTORY, entry.selectedId);
  };

  return {
    getSnapshot: (): GeoSnapshot => snapshot,

    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    commit: publish,

    setGeometry: (featureId: string, geometry: Geometry, origin: EditOrigin): void => {
      setGeometries([{ featureId, geometry }], origin);
    },

    setGeometries,

    addFeature: (geometry: Geometry, origin: EditOrigin): string => {
      const id: string = GeoUtils.nextFeatureId(snapshot.collection);
      const feature: Feature = { type: "Feature", id, geometry, properties: {} };
      publish(
        { type: "FeatureCollection", features: [...snapshot.collection.features, feature] },
        origin,
      );
      snapshot = { ...snapshot, selectedId: id };
      emit();
      return id;
    },

    removeFeature: (featureId: string, origin: EditOrigin): void => {
      const features: Feature[] = snapshot.collection.features.filter(
        (feature: Feature) => String(feature.id) !== featureId,
      );
      publish({ type: "FeatureCollection", features }, origin);
    },

    // Selection is view state, so it deliberately does not bump `revision`.
    select: (featureId: string | null): void => {
      if (snapshot.selectedId === featureId) return;
      snapshot = { ...snapshot, selectedId: featureId };
      emit();
    },

    focus: (position: Position): void => {
      const nonce: number = (snapshot.focus?.nonce ?? 0) + 1;
      snapshot = { ...snapshot, focus: { position, nonce } };
      emit();
    },

    undo: (): void => {
      travel(past, future);
    },

    redo: (): void => {
      travel(future, past);
    },

    beginGesture: (): void => {
      gesturing = true;
    },

    endGesture: (): void => {
      gesturing = false;
    },
  };
}

export const geoStore: GeoStore = createGeoStore(INITIAL_COLLECTION);
