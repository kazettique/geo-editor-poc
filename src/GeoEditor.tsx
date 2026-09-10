import { useGeoSnapshot } from "./core/useGeoStore";
import JsonEditor from "./editor/JsonEditor";
import CoordinateInputs from "./inspector/CoordinateInputs";
import Pane from "./layout/Pane";
import MapView from "./map/MapView";
import SearchPanel from "./search/SearchPanel";

function GeoEditor() {
  const snapshot = useGeoSnapshot();

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-800">
      <header className="flex shrink-0 items-baseline gap-3 border-b border-slate-300 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">Geo Editor PoC</h1>
        <p className="text-xs text-slate-500">
          GeoJSON text, map and location search kept in bi-directional sync
        </p>
        <p className="ml-auto font-mono text-[11px] text-slate-400">
          rev {snapshot.revision} · {snapshot.origin} · sel {snapshot.selectedId ?? "—"}
        </p>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(320px,2fr)_minmax(0,3fr)_minmax(280px,1fr)] gap-px bg-slate-300">
        <Pane title="GeoJSON">
          <JsonEditor snapshot={snapshot} />
        </Pane>

        <Pane title="Map">
          <MapView snapshot={snapshot} />
        </Pane>

        <Pane title="Inspector">
          <div className="flex h-full flex-col divide-y divide-slate-200">
            <div className="min-h-0 flex-1">
              <SearchPanel snapshot={snapshot} />
            </div>
            <div className="min-h-0 flex-1">
              <CoordinateInputs snapshot={snapshot} />
            </div>
          </div>
        </Pane>
      </main>
    </div>
  );
}

export default GeoEditor;
