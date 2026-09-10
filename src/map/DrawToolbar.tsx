import { MapTool, MapTools } from "./mapTools";

interface DrawToolbarProps {
  tool: MapTool;
  selectedId: string | null;
  onToolChange: (tool: MapTool) => void;
  onDelete: () => void;
}

function DrawToolbar({ tool, selectedId, onToolChange, onDelete }: DrawToolbarProps) {
  return (
    <div className="flex gap-1">
      <div className="flex overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
        {MapTools.OPTIONS.map((option) => (
          <button
            key={option.tool}
            type="button"
            onClick={() => {
              onToolChange(option.tool);
            }}
            className={`px-2 py-1 text-[11px] ${
              option.tool === tool ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={selectedId === null}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-red-600 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
      >
        Delete
      </button>
    </div>
  );
}

export default DrawToolbar;
