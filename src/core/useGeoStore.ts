import { useSyncExternalStore } from "react";
import { geoStore } from "./geoStore";
import type { GeoSnapshot } from "./types";

export function useGeoSnapshot(): GeoSnapshot {
  return useSyncExternalStore(geoStore.subscribe, geoStore.getSnapshot);
}
