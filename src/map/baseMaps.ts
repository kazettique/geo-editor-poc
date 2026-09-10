import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";

export enum BaseMapId {
  OSM = "OSM",
  GSI_PALE = "GSI_PALE",
}

export interface BaseMapOption {
  readonly id: BaseMapId;
  readonly label: string;
}

/**
 * Tiles are a swappable concern here on purpose: the drawing layer and the geocoders
 * carry on working whichever of these is visible, which is the point the report needs
 * to make about rendering, editing and search being separable.
 */
export abstract class BaseMaps {
  public static readonly OPTIONS: readonly BaseMapOption[] = [
    { id: BaseMapId.OSM, label: "OSM" },
    { id: BaseMapId.GSI_PALE, label: "地理院 淡色" },
  ];

  public static create(id: BaseMapId): TileLayer {
    if (id === BaseMapId.GSI_PALE) {
      return new TileLayer({
        source: new XYZ({
          url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
          maxZoom: 18,
          attributions:
            '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>',
        }),
      });
    }
    return new TileLayer({ source: new OSM() });
  }
}
