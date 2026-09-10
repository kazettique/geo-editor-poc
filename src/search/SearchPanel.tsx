import { useEffect, useState } from "react";
import { GeoUtils } from "../core/GeoUtils";
import { geoStore } from "../core/geoStore";
import { EditOrigin, GeometryKind, type GeoSnapshot } from "../core/types";
import { gsiProvider } from "./providers/gsi";
import { nominatimProvider } from "./providers/nominatim";
import type { GeocodeProvider, GeocodeResult } from "./providers/types";
import { GeocoderId } from "./providers/types";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

const PROVIDERS: readonly GeocodeProvider[] = [nominatimProvider, gsiProvider];

function describeError(error: unknown): string {
  // fetch rejects with TypeError for network and CORS failures alike — the browser
  // deliberately refuses to tell scripts which, so we have to name both.
  if (error instanceof TypeError) {
    return "Request blocked — CORS or network. A CMS-side proxy would be required.";
  }
  return error instanceof Error ? error.message : "Search failed";
}

interface SearchPanelProps {
  snapshot: GeoSnapshot;
}

function SearchPanel({ snapshot }: SearchPanelProps) {
  const [query, setQuery] = useState<string>("");
  const [providerId, setProviderId] = useState<GeocoderId>(GeocoderId.NOMINATIM);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const provider: GeocodeProvider =
    PROVIDERS.find((entry) => entry.id === providerId) ?? PROVIDERS[0];
  const trimmed: string = query.trim();
  const active: boolean = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer: number = window.setTimeout(() => {
      setLoading(true);
      provider
        .search(trimmed, controller.signal)
        .then((found: GeocodeResult[]) => {
          setResults(found);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(describeError(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, provider]);

  const applyResult = (result: GeocodeResult): void => {
    const feature = GeoUtils.findFeature(snapshot.collection, snapshot.selectedId);
    const geometry = feature?.geometry ?? null;

    if (feature && geometry?.type === GeometryKind.POINT) {
      geoStore.setGeometry(
        String(feature.id),
        { type: GeometryKind.POINT, coordinates: result.position },
        EditOrigin.SEARCH,
      );
    } else {
      geoStore.addFeature(
        { type: GeometryKind.POINT, coordinates: result.position },
        EditOrigin.SEARCH,
      );
    }
    geoStore.focus(result.position);
  };

  // Held rather than cleared in the effect, so a short query hides stale results
  // without a synchronous setState during the effect body.
  const visibleResults: GeocodeResult[] = active ? results : [];
  const visibleError: string | null = active ? error : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 p-3">
        <div className="flex overflow-hidden rounded border border-slate-300">
          {PROVIDERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setProviderId(entry.id);
              }}
              className={`flex-1 px-2 py-1 text-[11px] ${
                entry.id === providerId
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          placeholder="東京駅 / 丸の内一丁目 / Tokyo"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-slate-400"
        />

        <p className="text-[11px] leading-snug text-slate-400">{provider.note}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto border-t border-slate-200">
        {loading && active && <Status>Searching…</Status>}
        {visibleError !== null && <Status tone="error">{visibleError}</Status>}
        {!loading && visibleError === null && active && visibleResults.length === 0 && (
          <Status>No matches.</Status>
        )}

        <ul>
          {visibleResults.map((result: GeocodeResult) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => {
                  applyResult(result);
                }}
                className="w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="block text-xs text-slate-800">{result.label}</span>
                {result.kind !== null && (
                  <span className="block font-mono text-[10px] text-amber-700">{result.kind}</span>
                )}
                {result.detail !== null && (
                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                    {result.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="shrink-0 border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-400">
        {provider.attribution} · applies to the selected Point, else adds a new one
      </p>
    </div>
  );
}

function Status({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <p className={`px-3 py-2 text-[11px] ${tone === "error" ? "text-red-600" : "text-slate-400"}`}>
      {children}
    </p>
  );
}

export default SearchPanel;
