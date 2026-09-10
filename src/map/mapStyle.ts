import type { FeatureLike } from "ol/Feature";
import Geometry from "ol/geom/Geometry";
import GeometryCollection from "ol/geom/GeometryCollection";
import MultiPoint from "ol/geom/MultiPoint";
import SimpleGeometry from "ol/geom/SimpleGeometry";
import CircleStyle from "ol/style/Circle";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";

export abstract class MapStyle {
  public static readonly ACCENT = "#2563eb";
  public static readonly SELECTED = "#ea580c";

  /**
   * Vertices are drawn explicitly so a LineString or Polygon shows exactly the
   * positions present in the GeoJSON — without them it is impossible to tell a
   * dropped or duplicated coordinate from a rendering artefact.
   */
  public static forFeature(feature: FeatureLike, selectedId: string | null): Style[] {
    const selected: boolean = selectedId !== null && String(feature.getId()) === selectedId;
    const colour: string = selected ? MapStyle.SELECTED : MapStyle.ACCENT;

    const base = new Style({
      stroke: new Stroke({ color: colour, width: selected ? 3 : 2 }),
      fill: new Fill({ color: selected ? "rgba(234,88,12,0.15)" : "rgba(37,99,235,0.12)" }),
      image: new CircleStyle({
        radius: selected ? 7 : 6,
        fill: new Fill({ color: colour }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
      }),
    });

    const vertices = new Style({
      image: new CircleStyle({
        radius: 3,
        fill: new Fill({ color: "#fff" }),
        stroke: new Stroke({ color: colour, width: 1.5 }),
      }),
      geometry: (target: FeatureLike): Geometry | undefined => {
        // FeatureLike also covers RenderFeature, which has no real geometry to walk.
        const geometry = target.getGeometry();
        if (!(geometry instanceof Geometry)) return undefined;
        const positions: number[][] = MapStyle.collectVertices(geometry);
        return positions.length > 1 ? new MultiPoint(positions) : undefined;
      },
    });

    return [base, vertices];
  }

  private static collectVertices(geometry: Geometry): number[][] {
    if (geometry instanceof GeometryCollection) {
      return geometry.getGeometries().flatMap((entry) => MapStyle.collectVertices(entry));
    }
    if (geometry instanceof SimpleGeometry) {
      return MapStyle.flattenPositions(geometry.getCoordinates());
    }
    return [];
  }

  private static flattenPositions(value: unknown): number[][] {
    if (!Array.isArray(value) || value.length === 0) return [];
    if (typeof value[0] === "number") return [value as number[]];
    return (value as unknown[]).flatMap((entry) => MapStyle.flattenPositions(entry));
  }
}
