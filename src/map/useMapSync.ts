import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import type VectorSource from "ol/source/Vector";
import type { Feature as GeoJsonFeature } from "geojson";
import type { GeoSnapshot } from "../core/types";

/** The store is WGS84; the map renders in Web Mercator. */
export const GEOJSON_FORMAT = new GeoJSON({
  dataProjection: "EPSG:4326",
  featureProjection: "EPSG:3857",
});

/**
 * Store -> map, by diff.
 *
 * Deliberately not `source.clear()` + re-add: that would throw away the ol Feature
 * instances that Modify, Translate and Select hold references to, so any in-progress
 * drag would die the moment the store notified. Instead, untouched features are left
 * completely alone and changed ones are mutated in place via `setGeometry`.
 */
export function useMapSync(source: VectorSource | null, snapshot: GeoSnapshot): void {
  /** id -> the geometry JSON last pushed onto the map, so we can skip unchanged features. */
  const appliedRef = useRef<Map<string, string>>(new Map());
  const sourceRef = useRef<VectorSource | null>(null);

  useEffect(() => {
    if (!source) return;

    // A remount hands us a fresh, empty source; the old signatures would then make
    // every feature look already-applied and nothing would render.
    if (sourceRef.current !== source) {
      appliedRef.current.clear();
      sourceRef.current = source;
    }

    const applied: Map<string, string> = appliedRef.current;
    const present = new Set<string>();

    for (const feature of snapshot.collection.features as GeoJsonFeature[]) {
      const id: string = String(feature.id);
      present.add(id);
      if (!feature.geometry) continue;

      const signature: string = JSON.stringify(feature.geometry);
      if (applied.get(id) === signature) continue;

      const geometry: Geometry = GEOJSON_FORMAT.readGeometry(feature.geometry);
      const existing = source.getFeatureById(id);
      if (existing) {
        existing.setGeometry(geometry);
      } else {
        const created = new Feature<Geometry>({ geometry });
        created.setId(id);
        source.addFeature(created);
      }
      applied.set(id, signature);
    }

    for (const id of [...applied.keys()]) {
      if (present.has(id)) continue;
      const stale = source.getFeatureById(id);
      if (stale) source.removeFeature(stale);
      applied.delete(id);
    }
  }, [source, snapshot]);
}
