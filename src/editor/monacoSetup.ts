import { loader } from "@monaco-editor/react";
// Subpaths go through monaco 0.56's exports map ("./*" -> "./esm/vs/*.js"), so the
// old "monaco-editor/esm/vs/..." specifiers no longer resolve.
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/languages/features/json/json.worker?worker";
import { GEOJSON_SCHEMA, GEOJSON_SCHEMA_URI } from "./geojsonSchema";
import { jsonDefaults, monaco } from "./monacoRuntime";

// Without this, @monaco-editor/react silently pulls Monaco off a CDN at runtime,
// which breaks offline use and is not acceptable inside CMS.
window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    return label === "json" ? new JsonWorker() : new EditorWorker();
  },
};

loader.config({ monaco });

jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  // The schema is bundled, so never let the language service fetch over the network.
  enableSchemaRequest: false,
  schemas: [
    {
      uri: GEOJSON_SCHEMA_URI,
      fileMatch: ["*"],
      schema: GEOJSON_SCHEMA,
    },
  ],
});

export const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontSize: 12,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: "on",
  bracketPairColorization: { enabled: true },
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
};
