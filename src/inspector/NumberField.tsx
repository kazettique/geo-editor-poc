import { useState } from "react";

interface NumberFieldProps {
  /** Omitted where the caller prints a column header instead of a per-field label. */
  label?: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}

/**
 * Commits on blur or Enter rather than on every keystroke: typing "139" one character
 * at a time would otherwise walk the point through 1°, 13°, 139° and fire three map
 * updates for one intended edit.
 */
function NumberField({ label, value, min, max, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string>(String(value));
  const [seenValue, setSeenValue] = useState<number>(value);

  // Follow the store whenever the value changes underneath us — a map drag, a search
  // result, or a text edit all land here. Adjusted during render rather than in an
  // effect, which is React's prescribed shape for "reset state when a prop changes".
  if (seenValue !== value) {
    setSeenValue(value);
    setDraft(String(value));
  }

  const parsed: number = Number(draft);
  const invalid: boolean = draft.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max;

  const commit = (): void => {
    if (invalid) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <label className="flex flex-col gap-1">
      {label !== undefined && <span className="text-[11px] text-slate-500">{label}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        className={`w-full rounded border px-2 py-1 font-mono text-xs outline-none focus:ring-1 ${
          invalid
            ? "border-red-400 text-red-700 focus:ring-red-300"
            : "border-slate-300 focus:ring-slate-400"
        }`}
      />
    </label>
  );
}

export default NumberField;
