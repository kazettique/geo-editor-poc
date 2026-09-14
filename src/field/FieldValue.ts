import type { Feature, FeatureCollection, Geometry } from "geojson";
import { geometrySchema } from "../core/geoSchema";

/**
 * The host Geometry field's value shape, isolated in one file.
 *
 * The field stores a **single bare geometry, serialized to a string** — the server's
 * validator switches on the value's `type` and accepts only the seven geometry types,
 * rejecting `Feature` and `FeatureCollection` outright. A repeated field is not one value
 * holding several geometries; it is N independent editors, each with a value of its own.
 *
 * This PoC's store holds a `FeatureCollection` because that is convenient for a map that
 * diffs on feature id — scaffolding, not a model of the field. Everything that reconciles
 * the two shapes lives here, so a change in the stored envelope is a change to this file
 * and nothing else. `src/core/` deliberately never imports from this directory.
 */

/** Why a value could not be carried — data, so the pane owns the wording. */
export enum FieldValueIssue {
  /** Neither a string nor absent: the backend sent something unexpected. */
  NOT_A_STRING = "NOT_A_STRING",
  /** An array — a repeated field's value, whose entries belong to other editors. */
  NOT_A_SINGLE_VALUE = "NOT_A_SINGLE_VALUE",
  INVALID_JSON = "INVALID_JSON",
  /** Valid JSON but not a bare geometry; a Feature or FeatureCollection lands here. */
  NOT_A_GEOMETRY = "NOT_A_GEOMETRY",
}

export interface FieldIssue {
  readonly issue: FieldValueIssue;
  readonly message: string;
}

export interface FieldReadSuccess {
  readonly ok: true;
  /** Zero or one feature. Ids and rounding are `GeoUtils.normalize`'s job, not this file's. */
  readonly collection: FeatureCollection;
}

export interface FieldReadFailure {
  readonly ok: false;
  readonly issue: FieldIssue;
}

export type FieldReadResult = FieldReadSuccess | FieldReadFailure;

export interface FieldWriteResult {
  /** Exactly what the field would store. `null` is "no value". */
  readonly value: string | null;
  /** Geometries beyond the first — a field value holds exactly one. */
  readonly overflow: number;
}

export abstract class FieldValue {
  /**
   * Takes `unknown` because the value arrives from a GraphQL response. Narrowing the
   * parameter would push validation onto the caller, which is the coupling this file
   * exists to prevent, and it turns "the backend sent a number" into an issue rather
   * than a crash.
   */
  public static read(value: unknown): FieldReadResult {
    if (Array.isArray(value)) {
      return FieldValue.fail(
        FieldValueIssue.NOT_A_SINGLE_VALUE,
        "That is a repeated field's value. Each entry belongs to its own editor — paste one geometry.",
      );
    }
    // An unset field is a legal state, not an error.
    if (value === null || value === undefined) return FieldValue.empty();
    if (typeof value !== "string") {
      return FieldValue.fail(FieldValueIssue.NOT_A_STRING, "A field value is a JSON string.");
    }

    const trimmed: string = value.trim();
    if (trimmed === "") return FieldValue.empty();

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch (error) {
      const detail: string = error instanceof Error ? error.message : "Invalid JSON";
      return FieldValue.fail(FieldValueIssue.INVALID_JSON, detail);
    }
    // A serializer that wrote `null` recorded an absence, not a corruption.
    if (raw === null) return FieldValue.empty();

    const parsed = geometrySchema.safeParse(raw);
    if (!parsed.success) {
      return FieldValue.fail(
        FieldValueIssue.NOT_A_GEOMETRY,
        "A field value is a bare geometry — not a Feature and not a FeatureCollection.",
      );
    }

    // No id: `normalize` mints one on commit, which is precisely why ids have no place in
    // a stored value and why they never survive back out of `write`.
    const feature: Feature = { type: "Feature", geometry: parsed.data, properties: {} };
    return { ok: true, collection: { type: "FeatureCollection", features: [feature] } };
  }

  public static write(collection: FeatureCollection): FieldWriteResult {
    const geometries: Geometry[] = [];
    for (const feature of collection.features) {
      // The schema admits a null geometry, so the static type here is optimistic. A
      // feature without one contributes no entry: the value has no representation for an
      // empty slot other than omission.
      const geometry: Geometry | null = feature.geometry ?? null;
      if (geometry === null) continue;
      geometries.push(geometry);
    }

    return {
      // Deliberately unrounded. `normalize` already rounded on the way in, and a second
      // independently-configured rounding is how two precisions drift apart.
      value: geometries.length > 0 ? JSON.stringify(geometries[0]) : null,
      // First wins, so a value loaded from the server survives a stray Draw. Preventing
      // the second geometry from existing is the host's job, not this file's.
      overflow: Math.max(0, geometries.length - 1),
    };
  }

  private static empty(): FieldReadSuccess {
    return { ok: true, collection: { type: "FeatureCollection", features: [] } };
  }

  private static fail(issue: FieldValueIssue, message: string): FieldReadFailure {
    return { ok: false, issue: { issue, message } };
  }
}
