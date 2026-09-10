import Editor, { type OnChange, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import { GeoUtils } from "../core/GeoUtils";
import { geoStore } from "../core/geoStore";
import { EditOrigin, type GeoSnapshot } from "../core/types";
import { monaco } from "./monacoRuntime";
import { EDITOR_OPTIONS } from "./monacoSetup";

const COMMIT_DEBOUNCE_MS = 300;

interface JsonEditorProps {
  snapshot: GeoSnapshot;
}

function JsonEditor({ snapshot }: JsonEditorProps) {
  const [text, setText] = useState<string>(() => GeoUtils.stringify(snapshot.collection));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<boolean>(false);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Last store revision this pane has already reflected in its text. */
  const appliedRevisionRef = useRef<number>(snapshot.revision);
  /** True while the text has diverged from the store and is not committed yet. */
  const dirtyRef = useRef<boolean>(false);

  const applyFromStore = useCallback((next: GeoSnapshot): void => {
    // A commit still in flight would land after this and silently reinstate the
    // text we are about to replace.
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setText(GeoUtils.stringify(next.collection));
    appliedRevisionRef.current = next.revision;
    dirtyRef.current = false;
    setConflict(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (snapshot.revision === appliedRevisionRef.current) return;

    // Someone else changed the data while the user is part-way through typing.
    // Overwriting would destroy their in-progress edit, so hand them the choice.
    // An undo/redo is the user's own deliberate act, so it skips the prompt.
    if (
      snapshot.origin !== EditOrigin.HISTORY &&
      dirtyRef.current &&
      (editorRef.current?.hasTextFocus() ?? false)
    ) {
      setConflict(true);
      return;
    }
    applyFromStore(snapshot);
  }, [snapshot, applyFromStore]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange: OnChange = (value) => {
    const next: string = value ?? "";
    setText(next);
    dirtyRef.current = true;

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const result = GeoUtils.parse(next);
      if (!result.ok) {
        // Keep the invalid text local; the store holds its last good state.
        setError(result.message);
        return;
      }
      setError(null);
      geoStore.commit(result.collection, EditOrigin.TEXT);
      // Claim the revision we just produced so the effect above does not
      // reformat the user's text out from under them.
      appliedRevisionRef.current = geoStore.getSnapshot().revision;
      dirtyRef.current = false;
    }, COMMIT_DEBOUNCE_MS);
  };

  const handleMount: OnMount = (instance) => {
    editorRef.current = instance;

    // These beat Monaco's built-in undo because the keybinding resolver scans
    // dynamic registrations after the defaults and takes the last match; addAction
    // also scopes them to this editor. Text-buffer undo would desync this pane from
    // the store, and the debounce would then commit the stale text straight back.
    instance.addAction({
      id: "geo.history.undo",
      label: "Undo (document)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ],
      run: () => {
        geoStore.undo();
      },
    });
    instance.addAction({
      id: "geo.history.redo",
      label: "Redo (document)",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY,
      ],
      run: () => {
        geoStore.redo();
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <Editor
          language="json"
          value={text}
          options={EDITOR_OPTIONS}
          onChange={handleChange}
          onMount={handleMount}
          loading={<div className="p-3 text-xs text-slate-400">Loading editor…</div>}
        />
      </div>
      <StatusBar
        error={error}
        conflict={conflict}
        onReload={() => {
          applyFromStore(geoStore.getSnapshot());
        }}
      />
    </div>
  );
}

interface StatusBarProps {
  error: string | null;
  conflict: boolean;
  onReload: () => void;
}

function StatusBar({ error, conflict, onReload }: StatusBarProps) {
  if (conflict) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
        <span className="flex-1">Changed elsewhere while you were typing.</span>
        <button
          type="button"
          onClick={onReload}
          className="rounded border border-amber-400 px-1.5 py-0.5 font-medium hover:bg-amber-100"
        >
          Discard &amp; reload
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shrink-0 truncate border-t border-red-300 bg-red-50 px-3 py-1.5 font-mono text-[11px] text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-400">
      Valid GeoJSON — synced
    </div>
  );
}

export default JsonEditor;
