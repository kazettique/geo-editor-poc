import { Fragment, useState, type Ref } from "react";
import type { Feature, Geometry, Position } from "geojson";
import { GeoUtils } from "../core/GeoUtils";
import { geoStore } from "../core/geoStore";
import {
  EDITABLE_KINDS,
  EditOrigin,
  FocusMode,
  GeometryKind,
  type VertexRef,
} from "../core/types";
import NumberField from "../inspector/NumberField";

/** Beyond this the pane stops being usable, so the tail stays in the text pane. */
const MAX_VERTEX_ROWS = 200;

interface FeatureCardProps {
  feature: Feature;
  selected: boolean;
  /** Lets the form scroll this card into view when the map selects its feature. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * One feature as a form. Rendered keyed by feature id, so the collapse flag below follows
 * its feature through unrelated commits and resets when a paste or an undo brings in a
 * different document.
 */
function FeatureCard({ feature, selected, ref }: FeatureCardProps) {
  const [open, setOpen] = useState<boolean>(true);

  const featureId: string = String(feature.id);
  const geometry: Geometry | null = feature.geometry ?? null;
  const editable: boolean = GeoUtils.isEditableKind(geometry);
  // Capped before the walk, not after: a pasted geometry can carry thousands of vertices
  // and building a ref for each of them on every commit is the part that hurts.
  const total: number = geometry ? GeoUtils.countVertices(geometry) : 0;
  const vertices: VertexRef[] = geometry ? GeoUtils.listVertices(geometry, MAX_VERTEX_ROWS) : [];

  const changeKind = (element: HTMLSelectElement, kind: GeometryKind): void => {
    if (!geometry) {
      geoStore.setGeometry(
        featureId,
        GeoUtils.createGeometry(kind, GeoUtils.DEFAULT_CENTER),
        EditOrigin.FORM,
      );
      return;
    }

    const next: Geometry = GeoUtils.convertGeometry(geometry, kind);
    const dropped: number = GeoUtils.droppedPositions(geometry, next);
    if (dropped > 0) {
      const proceed: boolean = window.confirm(
        `Converting ${geometry.type} to ${kind} discards ${String(dropped)} of ` +
          `${String(GeoUtils.countPositions(geometry))} positions. Continue?`,
      );
      if (!proceed) {
        // React restores a controlled select's DOM value after the change event even when
        // no re-render follows, but doing it here keeps the revert visible at the call site.
        element.value = geometry.type;
        return;
      }
    }
    geoStore.setGeometry(featureId, next, EditOrigin.FORM);
  };

  const commitVertex = (vertex: VertexRef, lon: number, lat: number): void => {
    if (!geometry) return;
    // Preserve any altitude the position already carried.
    const next: Position = vertex.position.length > 2 ? [lon, lat, vertex.position[2]] : [lon, lat];
    geoStore.setGeometry(
      featureId,
      GeoUtils.setVertex(geometry, vertex.index, next),
      EditOrigin.FORM,
    );
  };

  const structural = (next: Geometry): void => {
    geoStore.setGeometry(featureId, next, EditOrigin.FORM);
  };

  const selectThis = (): void => {
    // Clicks land here constantly — every click into a coordinate input bubbles up — so
    // do nothing once this card already owns the selection.
    if (selected) return;
    geoStore.select(featureId);
    // Highlighting a shape the user cannot see reads as nothing having happened.
    const position: Position | null = GeoUtils.firstPosition(geometry);
    if (position) geoStore.focus(position, FocusMode.IF_OFFSCREEN);
  };

  return (
    // Selecting from anywhere in the card, rather than from the id alone, so editing a
    // vertex highlights the feature it belongs to on the map. onFocusCapture covers the
    // keyboard path, which a click handler alone would miss.
    <div
      ref={ref}
      onClick={selectThis}
      onFocusCapture={selectThis}
      className={`rounded border ${selected ? "border-slate-500 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
          }}
          aria-expanded={open}
          className="text-[8px] text-slate-400 hover:text-slate-700"
        >
          <span className={open ? "" : "inline-block -rotate-90"}>▼</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const position: Position | null = GeoUtils.firstPosition(geometry);
            if (position) geoStore.focus(position);
          }}
          title="Centre the map on this feature"
          className="font-mono text-[11px] text-slate-600 hover:text-slate-900"
        >
          {featureId}
        </button>

        <select
          value={geometry?.type ?? ""}
          onChange={(event) => {
            changeKind(event.currentTarget, event.currentTarget.value as GeometryKind);
          }}
          className="ml-auto rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-slate-400"
        >
          {!geometry && (
            <option value="" disabled>
              no geometry
            </option>
          )}
          {geometry && !editable && (
            <option value={geometry.type} disabled>
              {geometry.type}
            </option>
          )}
          {EDITABLE_KINDS.map((kind: GeometryKind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={(event) => {
            // Without this the card's own handler re-selects the id we just deleted.
            event.stopPropagation();
            geoStore.removeFeature(featureId, EditOrigin.FORM);
          }}
          title="Remove feature"
          className="px-1 text-[11px] text-red-600 hover:bg-red-50"
        >
          ✕
        </button>
      </div>

      {open && geometry && !editable && (
        <p className="border-t border-slate-200 px-2 py-1.5 text-[11px] leading-relaxed text-slate-400">
          <span className="font-mono">{geometry.type}</span> is not addressable vertex by vertex
          in this PoC — {String(GeoUtils.countPositions(geometry))} positions. Convert it above,
          or edit it in the text pane.
        </p>
      )}

      {open && geometry && editable && (
        <div className="border-t border-slate-200 px-2 py-1.5">
          <div className="grid grid-cols-[minmax(0,auto)_1fr_1fr_auto] items-center gap-x-2 gap-y-1">
            <span />
            <span className="text-[10px] text-slate-400">Longitude</span>
            <span className="text-[10px] text-slate-400">Latitude</span>
            <span />

            {vertices.map((vertex: VertexRef) => (
              <Fragment key={vertex.index}>
                <span className="truncate text-[11px] text-slate-500" title={vertex.label}>
                  {vertex.label}
                </span>
                <NumberField
                  value={vertex.position[0]}
                  min={-180}
                  max={180}
                  onCommit={(longitude) => {
                    commitVertex(vertex, longitude, vertex.position[1]);
                  }}
                />
                <NumberField
                  value={vertex.position[1]}
                  min={-90}
                  max={90}
                  onCommit={(latitude) => {
                    commitVertex(vertex, vertex.position[0], latitude);
                  }}
                />
                <span className="flex">
                  {geometry.type !== GeometryKind.POINT && (
                    <>
                      <button
                        type="button"
                        title="Insert a vertex after this one"
                        onClick={() => {
                          structural(GeoUtils.insertVertex(geometry, vertex.index));
                        }}
                        className="px-1 text-[11px] text-slate-500 hover:bg-slate-100"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        title="Remove this vertex"
                        disabled={!GeoUtils.canRemoveVertex(geometry, vertex.index)}
                        onClick={() => {
                          structural(GeoUtils.removeVertex(geometry, vertex.index));
                        }}
                        className="px-1 text-[11px] text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </span>
              </Fragment>
            ))}
          </div>

          {total > vertices.length && (
            <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] text-amber-700">
              Showing {String(vertices.length)} of {String(total)} vertices — edit the rest in the
              text pane.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default FeatureCard;
