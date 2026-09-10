import type { Position } from "geojson";
import { GeocoderId, MAX_RESULTS, type GeocodeProvider, type GeocodeResult } from "./types";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

interface NominatimEntry {
  readonly place_id: number;
  readonly lat: string;
  readonly lon: string;
  readonly name?: string;
  readonly display_name: string;
  readonly category?: string;
  readonly type?: string;
}

/**
 * The public endpoint's usage policy caps this at 1 request/second and asks for an
 * identifying User-Agent — which a browser will not let us set, so the request is
 * identified only by Referer. That makes the public instance unsuitable for CMS
 * production traffic; self-hosting or a paid mirror is the real option.
 */
export const nominatimProvider: GeocodeProvider = {
  id: GeocoderId.NOMINATIM,
  label: "Nominatim",
  attribution: "© OpenStreetMap contributors (ODbL)",
  note: "Global coverage and place names. Free, but 1 req/s and no production use on the public endpoint.",

  async search(query: string, signal: AbortSignal): Promise<GeocodeResult[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(MAX_RESULTS));
    url.searchParams.set("accept-language", navigator.language);

    const response: Response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Nominatim returned ${String(response.status)}`);

    const entries = (await response.json()) as NominatimEntry[];
    return entries.map((entry: NominatimEntry): GeocodeResult => {
      const name: string = entry.name?.trim() ?? "";
      return {
        id: String(entry.place_id),
        label: name === "" ? entry.display_name : name,
        detail: entry.display_name,
        kind: [entry.category, entry.type].filter(Boolean).join(" / ") || null,
        position: [Number(entry.lon), Number(entry.lat)] as Position,
      };
    });
  },
};
