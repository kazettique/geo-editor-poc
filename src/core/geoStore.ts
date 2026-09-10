import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { GeoUtils } from "./GeoUtils";
import { EditOrigin, GeometryKind, type GeoSnapshot } from "./types";

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
}

export function createGeoStore(initial: FeatureCollection): GeoStore {
  const listeners = new Set<() => void>();

  let snapshot: GeoSnapshot = {
    collection: GeoUtils.normalize(initial),
    revision: 1,
    origin: EditOrigin.INITIAL,
    selectedId: null,
    focus: null,
  };

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const publish = (collection: FeatureCollection, origin: EditOrigin): void => {
    const normalized: FeatureCollection = GeoUtils.normalize(collection);
    // Drop no-op commits so an edit that round-trips back to identical data dies
    // here instead of bouncing between the panes.
    if (GeoUtils.isEqual(normalized, snapshot.collection)) return;

    const selectionSurvives: boolean = GeoUtils.findFeature(normalized, snapshot.selectedId) !== null;
    snapshot = {
      collection: normalized,
      revision: snapshot.revision + 1,
      origin,
      selectedId: selectionSurvives ? snapshot.selectedId : null,
      focus: snapshot.focus,
    };
    emit();
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
  };
}

export const geoStore: GeoStore = createGeoStore(INITIAL_COLLECTION);
