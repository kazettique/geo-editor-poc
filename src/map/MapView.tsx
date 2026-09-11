import { useCallback, useEffect, useRef, useState } from "react";
import Collection from "ol/Collection";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import OlMap from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import type TileLayer from "ol/layer/Tile";
import VectorSource from "ol/source/Vector";
import { containsCoordinate, isEmpty, type Extent } from "ol/extent";
import { fromLonLat } from "ol/proj";
import type { Coordinate } from "ol/coordinate";
import "ol/ol.css";
import { GeoUtils } from "../core/GeoUtils";
import { geoStore } from "../core/geoStore";
import { EditOrigin, FocusMode, type GeoSnapshot } from "../core/types";
import { BaseMapId, BaseMaps } from "./baseMaps";
import DrawToolbar from "./DrawToolbar";
import { MapStyle } from "./mapStyle";
import { MapTool } from "./mapTools";
import { useMapInteractions } from "./useMapInteractions";
import { useMapSync } from "./useMapSync";

interface BaseLayerEntry {
  readonly id: BaseMapId;
  readonly layer: TileLayer;
}

interface MapHandles {
  readonly map: OlMap;
  readonly source: VectorSource;
  readonly layer: VectorLayer;
  readonly bases: readonly BaseLayerEntry[];
  /** Backs the Translate interaction; mirrors the store's selection. */
  readonly selected: Collection<Feature<Geometry>>;
}

interface MapViewProps {
  snapshot: GeoSnapshot;
}

function MapView({ snapshot }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [handles, setHandles] = useState<MapHandles | null>(null);
  const [baseMapId, setBaseMapId] = useState<BaseMapId>(BaseMapId.OSM);
  const [tool, setTool] = useState<MapTool>(MapTool.SELECT);

  // The style function runs on every render frame, so it reads selection from a ref
  // rather than closing over a value that would go stale.
  const selectedIdRef = useRef<string | null>(snapshot.selectedId);
  const fittedRef = useRef<boolean>(false);

  useEffect(() => {
    const container: HTMLDivElement | null = containerRef.current;
    if (!container) return;

    const source = new VectorSource();
    const layer = new VectorLayer({
      source,
      style: (feature) => MapStyle.forFeature(feature, selectedIdRef.current),
    });

    const bases: BaseLayerEntry[] = BaseMaps.OPTIONS.map((option) => {
      const tileLayer: TileLayer = BaseMaps.create(option.id);
      tileLayer.setVisible(option.id === BaseMapId.OSM);
      return { id: option.id, layer: tileLayer };
    });

    const map = new OlMap({
      target: container,
      layers: [...bases.map((entry) => entry.layer), layer],
      view: new View({
        center: fromLonLat(GeoUtils.DEFAULT_CENTER),
        zoom: GeoUtils.DEFAULT_ZOOM,
      }),
    });

    setHandles({ map, source, layer, bases, selected: new Collection<Feature<Geometry>>() });

    return () => {
      map.setTarget(undefined);
      map.dispose();
      setHandles(null);
    };
  }, []);

  useMapSync(handles?.source ?? null, snapshot);

  const handleDrawEnd = useCallback((): void => {
    setTool(MapTool.SELECT);
  }, []);

  useMapInteractions(handles, tool, handleDrawEnd);

  useEffect(() => {
    if (!handles) return;
    for (const entry of handles.bases) entry.layer.setVisible(entry.id === baseMapId);
  }, [handles, baseMapId]);

  // Mirror the store's selection into the Collection that Translate operates on.
  // Runs after useMapSync so a feature added in the same commit already exists.
  useEffect(() => {
    if (!handles) return;
    handles.selected.clear();
    if (snapshot.selectedId === null) return;
    const feature = handles.source.getFeatureById(snapshot.selectedId);
    if (feature) handles.selected.push(feature);
  }, [handles, snapshot]);

  // Selection is not part of the feature data, so ol has no reason to know it changed.
  useEffect(() => {
    selectedIdRef.current = snapshot.selectedId;
    handles?.layer.changed();
  }, [handles, snapshot.selectedId]);

  // Recentre on an explicit request — a search result, a newly added feature, or a
  // selection the user cannot currently see. Anything else moving the viewport out from
  // under them would be unasked for.
  useEffect(() => {
    const focus = snapshot.focus;
    if (!handles || !focus) return;
    const view = handles.map.getView();
    const centre: Coordinate = fromLonLat(focus.position);

    // getSize() is undefined until the map has been laid out once. With no viewport to
    // test against, recentre rather than silently do nothing.
    const size = handles.map.getSize();
    if (
      focus.mode === FocusMode.IF_OFFSCREEN &&
      size &&
      containsCoordinate(view.calculateExtent(size), centre)
    ) {
      return;
    }

    view.animate({
      center: centre,
      zoom: Math.max(view.getZoom() ?? 0, GeoUtils.DEFAULT_ZOOM),
      duration: 400,
    });
  }, [handles, snapshot.focus]);

  // Frame the seeded data once. Re-fitting on every change would yank the viewport
  // away from wherever the user had panned to.
  useEffect(() => {
    if (!handles || fittedRef.current) return;
    const extent: Extent | null = handles.source.getExtent();
    if (!extent || isEmpty(extent)) return;
    fittedRef.current = true;
    handles.map.getView().fit(extent, {
      padding: [48, 48, 48, 48],
      maxZoom: GeoUtils.DEFAULT_ZOOM,
    });
  }, [handles, snapshot]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-2 left-2">
        <DrawToolbar
          tool={tool}
          selectedId={snapshot.selectedId}
          onToolChange={setTool}
          onDelete={() => {
            if (snapshot.selectedId !== null) {
              geoStore.removeFeature(snapshot.selectedId, EditOrigin.MAP);
            }
          }}
        />
      </div>
      <div className="absolute top-2 right-2 flex overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
        {BaseMaps.OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setBaseMapId(option.id);
            }}
            className={`px-2 py-1 text-[11px] ${
              option.id === baseMapId
                ? "bg-slate-800 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default MapView;
