import { useEffect } from "react";
import { geoStore } from "./core/geoStore";
import type { GeoSnapshot } from "./core/types";
import { useGeoSnapshot } from "./core/useGeoStore";
import JsonEditor from "./editor/JsonEditor";
import CoordinateInputs from "./inspector/CoordinateInputs";
import Pane from "./layout/Pane";
import MapView from "./map/MapView";
import SearchPanel from "./search/SearchPanel";

function GeoEditor() {
  const snapshot = useGeoSnapshot();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key: string = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;

      const target = event.target as HTMLElement | null;
      // The text pane binds these keys on the editor itself. Plain inputs hold
      // draft text the store never sees, so they keep their native undo.
      if (target?.closest(".monaco-editor")) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      event.preventDefault();
      if (key === "y" || event.shiftKey) geoStore.redo();
      else geoStore.undo();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-800">
      <header className="flex shrink-0 items-baseline gap-3 border-b border-slate-300 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">Geo Editor PoC</h1>
        <p className="text-xs text-slate-500">
          GeoJSON text, map and location search kept in bi-directional sync
        </p>
        <div className="ml-auto flex items-center gap-3">
          <HistoryControls snapshot={snapshot} />
          <p className="font-mono text-[11px] text-slate-400">
            rev {snapshot.revision} · {snapshot.origin} · sel {snapshot.selectedId ?? "—"} · undo{" "}
            {snapshot.undoDepth} · redo {snapshot.redoDepth}
          </p>
        </div>
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

interface HistoryControlsProps {
  snapshot: GeoSnapshot;
}

function HistoryControls({ snapshot }: HistoryControlsProps) {
  return (
    <div className="flex overflow-hidden rounded border border-slate-300">
      <HistoryButton
        label="⟲"
        title="Undo (⌘Z)"
        disabled={snapshot.undoDepth === 0}
        onClick={() => {
          geoStore.undo();
        }}
      />
      <HistoryButton
        label="⟳"
        title="Redo (⇧⌘Z)"
        disabled={snapshot.redoDepth === 0}
        onClick={() => {
          geoStore.redo();
        }}
      />
    </div>
  );
}

interface HistoryButtonProps {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}

function HistoryButton({ label, title, disabled, onClick }: HistoryButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}

export default GeoEditor;
