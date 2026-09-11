import { useEffect, useRef } from "react";
import type { Feature, Position } from "geojson";
import { GeoUtils } from "../core/GeoUtils";
import { geoStore } from "../core/geoStore";
import { EditOrigin, GeometryKind, type GeoSnapshot } from "../core/types";
import FeatureCard from "./FeatureCard";

interface GeoFormProps {
  snapshot: GeoSnapshot;
}

/**
 * The whole collection as controls rather than text — the alternative to the pane above
 * for anyone who should not have to know what a linear ring is. Both write to the same
 * store, so neither is authoritative.
 */
function GeoForm({ snapshot }: GeoFormProps) {
  const features: Feature[] = snapshot.collection.features;
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Reveal whatever the map just selected. `block: "nearest"` is the browser's own
  // off-screen test, so a card already in view does not move and this never fights a
  // user who is part-way through scrolling the list.
  useEffect(() => {
    if (snapshot.selectedId === null) return;
    cardRefs.current.get(snapshot.selectedId)?.scrollIntoView({ block: "nearest" });
  }, [snapshot.selectedId]);

  const addFeature = (): void => {
    // Seed beside whatever the user is already looking at — the selection first, then
    // whatever is last in the document — so the new point lands in view and offset rather
    // than stacked on the one before it.
    const neighbour: Feature | null =
      GeoUtils.findFeature(snapshot.collection, snapshot.selectedId) ??
      features[features.length - 1] ??
      null;
    const previous: Position | null = neighbour ? GeoUtils.firstPosition(neighbour.geometry) : null;
    const anchor: Position = previous ? GeoUtils.offset(previous) : GeoUtils.DEFAULT_CENTER;

    // addFeature already selects what it created; focus so it is not added off-screen.
    geoStore.addFeature(GeoUtils.createGeometry(GeometryKind.POINT, anchor), EditOrigin.FORM);
    geoStore.focus(anchor);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-2">
        {features.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-slate-400">
            No features yet. Add one below, draw on the map, or paste GeoJSON into the text
            pane.
          </p>
        ) : (
          features.map((feature: Feature) => {
            const id: string = String(feature.id);
            return (
              <FeatureCard
                key={id}
                ref={(node: HTMLDivElement | null) => {
                  if (node) cardRefs.current.set(id, node);
                  return () => {
                    cardRefs.current.delete(id);
                  };
                }}
                feature={feature}
                selected={id === snapshot.selectedId}
              />
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-2 py-1.5">
        <button
          type="button"
          onClick={addFeature}
          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
        >
          + Add feature
        </button>
        <span className="text-[11px] text-slate-400">Enter or blur to apply · Esc to revert</span>
      </div>
    </div>
  );
}

export default GeoForm;
