import type { Position } from "geojson";
import { GeocoderId, MAX_RESULTS, type GeocodeProvider, type GeocodeResult } from "./types";

const ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

interface GsiEntry {
  readonly geometry: { readonly type: "Point"; readonly coordinates: Position };
  readonly properties: {
    readonly title: string;
    readonly addressCode?: string;
    readonly dataSource?: string;
  };
}

/**
 * 国土地理院 address search. Undocumented but long-stable, no key, no published quota.
 *
 * It is an *address* index, not a place index: "東京都千代田区丸の内一丁目" returns one
 * exact hit, while "東京駅" returns 北海道札幌市東区 because it matched the 東 character.
 * Pair it with a place-name provider rather than using it alone.
 *
 * Returns the full match list with no server-side limit, hence the client-side slice.
 */
export const gsiProvider: GeocodeProvider = {
  id: GeocoderId.GSI,
  label: "GSI 地理院",
  attribution: "国土地理院",
  note: "Japan-only, address-first. Precise on 住所, poor on landmark and place names.",

  async search(query: string, signal: AbortSignal): Promise<GeocodeResult[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", query);

    const response: Response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`GSI returned ${String(response.status)}`);

    const entries = (await response.json()) as GsiEntry[];
    return entries.slice(0, MAX_RESULTS).map(
      (entry: GsiEntry, index: number): GeocodeResult => ({
        id: `${entry.properties.title}-${String(index)}`,
        label: entry.properties.title,
        detail: null,
        kind: entry.properties.dataSource ?? null,
        position: entry.geometry.coordinates,
      }),
    );
  },
};
