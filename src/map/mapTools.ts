import type { Type as OlGeometryType } from "ol/geom/Geometry";
import { GeometryKind } from "../core/types";

export enum MapTool {
  SELECT = "SELECT",
  DRAW_POINT = "DRAW_POINT",
  DRAW_LINE_STRING = "DRAW_LINE_STRING",
  DRAW_POLYGON = "DRAW_POLYGON",
}

export interface MapToolOption {
  readonly tool: MapTool;
  readonly label: string;
}

export abstract class MapTools {
  public static readonly OPTIONS: readonly MapToolOption[] = [
    { tool: MapTool.SELECT, label: "Select" },
    { tool: MapTool.DRAW_POINT, label: "Point" },
    { tool: MapTool.DRAW_LINE_STRING, label: "Line" },
    { tool: MapTool.DRAW_POLYGON, label: "Polygon" },
  ];

  /**
   * ol's `Type` is a union of string literals, and a TypeScript string-enum member is
   * nominally distinct from its own value, so this maps rather than casts.
   */
  public static drawType(tool: MapTool): OlGeometryType | null {
    switch (tool) {
      case MapTool.DRAW_POINT:
        return "Point";
      case MapTool.DRAW_LINE_STRING:
        return "LineString";
      case MapTool.DRAW_POLYGON:
        return "Polygon";
      case MapTool.SELECT:
        return null;
    }
  }

  public static geometryKind(tool: MapTool): GeometryKind | null {
    switch (tool) {
      case MapTool.DRAW_POINT:
        return GeometryKind.POINT;
      case MapTool.DRAW_LINE_STRING:
        return GeometryKind.LINE_STRING;
      case MapTool.DRAW_POLYGON:
        return GeometryKind.POLYGON;
      case MapTool.SELECT:
        return null;
    }
  }
}
