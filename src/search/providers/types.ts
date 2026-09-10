import type { Position } from "geojson";

export enum GeocoderId {
  NOMINATIM = "NOMINATIM",
  GSI = "GSI",
}

export interface GeocodeResult {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
  /** What the provider thinks this place is — surfaces ranking quality in the UI. */
  readonly kind: string | null;
  /** [longitude, latitude] */
  readonly position: Position;
}

export interface GeocodeProvider {
  readonly id: GeocoderId;
  readonly label: string;
  readonly attribution: string;
  /** What this provider is actually good at — shown under the results. */
  readonly note: string;
  search(query: string, signal: AbortSignal): Promise<GeocodeResult[]>;
}

export const MAX_RESULTS = 8;
