import { useState } from "react";
import { geoStore } from "../core/geoStore";
import { EditOrigin, type GeoSnapshot } from "../core/types";
import { FieldValue, type FieldIssue, type FieldWriteResult } from "./FieldValue";

interface FieldValuePaneProps {
  snapshot: GeoSnapshot;
}

/**
 * The document as the host field would actually store it: one bare geometry, serialized.
 * Editable, so the inbound direction can be proved by pasting a real value rather than
 * asserted in a document.
 */
function FieldValuePane({ snapshot }: FieldValuePaneProps) {
  const emitted: FieldWriteResult = FieldValue.write(snapshot.collection);
  const value: string = emitted.value ?? "";

  const [draft, setDraft] = useState<string>(value);
  const [seenValue, setSeenValue] = useState<string>(value);
  const [issue, setIssue] = useState<FieldIssue | null>(null);

  // Follow the store whenever the emitted value changes underneath us — a map drag, an
  // undo and a text edit all land here. Adjusted during render rather than in an effect,
  // which is React's prescribed shape for "reset state when a prop changes".
  if (seenValue !== value) {
    setSeenValue(value);
    setDraft(value);
    setIssue(null);
  }

  const commit = (): void => {
    if (draft === value) return;
    // A cleared box is an unset field, which is a legal value rather than a parse failure.
    const result = FieldValue.read(draft.trim() === "" ? null : draft);
    if (!result.ok) {
      setIssue(result.issue);
      return;
    }
    setIssue(null);
    geoStore.commit(result.collection, EditOrigin.FIELD);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 p-2">
        <textarea
          value={draft}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(value);
              setIssue(null);
              event.currentTarget.blur();
            }
          }}
          placeholder="No value — the field is unset."
          className={`h-full min-h-16 w-full resize-none rounded border px-2 py-1 font-mono text-[11px] leading-relaxed outline-none focus:ring-1 ${
            issue
              ? "border-red-400 text-red-700 focus:ring-red-300"
              : "border-slate-300 focus:ring-slate-400"
          }`}
        />
      </div>
      <StatusBar issue={issue} overflow={emitted.overflow} />
    </div>
  );
}

interface StatusBarProps {
  issue: FieldIssue | null;
  overflow: number;
}

function StatusBar({ issue, overflow }: StatusBarProps) {
  if (issue) {
    return (
      <div className="shrink-0 border-t border-red-300 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
        {issue.message}
      </div>
    );
  }

  if (overflow > 0) {
    return (
      <div className="shrink-0 border-t border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
        {String(overflow)} further {overflow === 1 ? "geometry" : "geometries"} cannot be
        represented — a field value holds exactly one.
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-400">
      Blur to apply · Esc to revert
    </div>
  );
}

export default FieldValuePane;
