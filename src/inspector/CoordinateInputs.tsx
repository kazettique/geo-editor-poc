import { useState } from "react";
import type { Position } from "geojson";
import { GeoUtils } from "../core/GeoUtils";
import { geoStore } from "../core/geoStore";
import { EditOrigin, type GeoSnapshot, type VertexRef } from "../core/types";
import NumberField from "./NumberField";

interface CoordinateInputsProps {
  snapshot: GeoSnapshot;
}

function CoordinateInputs({ snapshot }: CoordinateInputsProps) {
  const [requestedIndex, setRequestedIndex] = useState<number>(0);

  const feature = GeoUtils.findFeature(snapshot.collection, snapshot.selectedId);
  const geometry = feature?.geometry ?? null;

  if (!feature || !geometry) {
    return <Hint>Select a feature on the map to edit its coordinates.</Hint>;
  }

  const vertices: VertexRef[] = GeoUtils.listVertices(geometry);

  if (vertices.length === 0) {
    return (
      <Hint>
        <span className="font-mono">{geometry.type}</span> renders but is not numerically
        editable in this PoC — {String(GeoUtils.countPositions(geometry))} positions.
      </Hint>
    );
  }

  // The list shrinks when vertices are deleted on the map, so clamp rather than reset.
  const index: number = Math.min(requestedIndex, vertices.length - 1);
  const vertex: VertexRef = vertices[index];
  const featureId: string = String(feature.id);

  const commit = (lon: number, lat: number): void => {
    // Preserve any altitude the position already carried.
    const next: Position =
      vertex.position.length > 2 ? [lon, lat, vertex.position[2]] : [lon, lat];
    geoStore.setGeometry(featureId, GeoUtils.setVertex(geometry, index, next), EditOrigin.NUMERIC);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] text-slate-500">
          {featureId} · {geometry.type}
        </span>
        {vertices.length > 1 && (
          <span className="text-[11px] text-slate-400">
            {String(index + 1)} / {String(vertices.length)}
          </span>
        )}
      </div>

      {vertices.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Vertex</span>
          <select
            value={index}
            onChange={(event) => {
              setRequestedIndex(Number(event.target.value));
            }}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-slate-400"
          >
            {vertices.map((entry: VertexRef) => (
              <option key={entry.index} value={entry.index}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <NumberField
        label="Latitude"
        value={vertex.position[1]}
        min={-90}
        max={90}
        onCommit={(latitude) => {
          commit(vertex.position[0], latitude);
        }}
      />
      <NumberField
        label="Longitude"
        value={vertex.position[0]}
        min={-180}
        max={180}
        onCommit={(longitude) => {
          commit(longitude, vertex.position[1]);
        }}
      />

      <p className="text-[11px] text-slate-400">Enter or blur to apply · Esc to revert</p>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="p-3 text-[11px] leading-relaxed text-slate-400">{children}</div>;
}

export default CoordinateInputs;
