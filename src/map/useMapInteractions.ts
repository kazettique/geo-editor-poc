import { useEffect } from "react";
import type Collection from "ol/Collection";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type Interaction from "ol/interaction/Interaction";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Snap from "ol/interaction/Snap";
import Translate from "ol/interaction/Translate";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Geometry as GeoJsonGeometry } from "geojson";
import { geoStore, type GeometryUpdate } from "../core/geoStore";
import { EditOrigin } from "../core/types";
import type { MapTool } from "./mapTools";
import { MapTools } from "./mapTools";
import { GEOJSON_FORMAT } from "./useMapSync";

export interface MapInteractionTargets {
  readonly map: OlMap;
  readonly source: VectorSource;
  readonly layer: VectorLayer;
  readonly selected: Collection<Feature<Geometry>>;
}

function toGeoJson(geometry: Geometry): GeoJsonGeometry {
  return GEOJSON_FORMAT.writeGeometryObject(geometry) as GeoJsonGeometry;
}

/** One gesture, one commit — hence the batched `setGeometries`. */
function commitFeatures(features: readonly Feature<Geometry>[]): void {
  const updates: GeometryUpdate[] = [];
  for (const feature of features) {
    const id = feature.getId();
    const geometry: Geometry | undefined = feature.getGeometry();
    if (id === undefined || !geometry) continue;
    updates.push({ featureId: String(id), geometry: toGeoJson(geometry) });
  }
  geoStore.setGeometries(updates, EditOrigin.MAP);
}

/**
 * Map -> store.
 *
 * Everything commits on the gesture's `*end` event. Committing on the continuous
 * `change` events instead would rewrite the text pane on every mouse move of a drag.
 */
export function useMapInteractions(
  targets: MapInteractionTargets | null,
  tool: MapTool,
  onDrawEnd: () => void,
): void {
  useEffect(() => {
    if (!targets) return;
    const { map, source, selected } = targets;
    const added: Interaction[] = [];

    const register = (interaction: Interaction): void => {
      map.addInteraction(interaction);
      added.push(interaction);
    };

    const drawType = MapTools.drawType(tool);

    if (drawType === null) {
      const modify = new Modify({ source });
      modify.on("modifyend", (event) => {
        commitFeatures(event.features.getArray());
      });
      register(modify);

      const translate = new Translate({ features: selected });
      translate.on("translateend", (event) => {
        commitFeatures(event.features.getArray());
      });
      register(translate);
    } else {
      // No `source` on purpose: letting Draw add the sketch itself would put an
      // id-less feature on the map that the store knows nothing about. The store
      // adds it instead, and it arrives back through useMapSync with a real id.
      const draw = new Draw({ type: drawType });
      draw.on("drawend", (event) => {
        const geometry: Geometry | undefined = event.feature.getGeometry();
        if (!geometry) return;
        geoStore.addFeature(toGeoJson(geometry), EditOrigin.MAP);
        onDrawEnd();
      });
      register(draw);
    }

    // Added last because ol dispatches to interactions in reverse order, and Snap
    // has to see the pointer event before Draw or Modify consume it.
    register(new Snap({ source }));

    return () => {
      for (const interaction of added) map.removeInteraction(interaction);
    };
  }, [targets, tool, onDrawEnd]);

  useEffect(() => {
    if (!targets || MapTools.drawType(tool) !== null) return;
    const { map, layer } = targets;

    const handleClick = (event: MapBrowserEvent): void => {
      const hit = map.forEachFeatureAtPixel(event.pixel, (feature) => feature, {
        layerFilter: (candidate) => candidate === layer,
        hitTolerance: 8,
      });
      geoStore.select(hit ? String(hit.getId()) : null);
    };

    map.on("click", handleClick);
    return () => {
      map.un("click", handleClick);
    };
  }, [targets, tool]);
}
