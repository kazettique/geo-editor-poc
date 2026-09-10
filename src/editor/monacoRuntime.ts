/**
 * A JSON-only Monaco build.
 *
 * The default `monaco-editor` entry registers every language it ships with, which
 * drags in the TypeScript, CSS and HTML language services and their workers — ~8.7MB
 * of emitted assets on top of a 4.2MB main chunk, none of it reachable from a GeoJSON
 * field. Importing the bare editor API plus only the contributions this pane actually
 * uses keeps the cost proportional to the feature.
 *
 * If a keybinding or widget turns out to be missing, the fix is to add its contribution
 * here — see `monaco-editor/esm/vs/editor/editor.main.js` for the full list.
 */
import * as monaco from "monaco-editor/editor/editor.api";

import "monaco-editor/editor/browser/coreCommands";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu";
import "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo";
import "monaco-editor/editor/contrib/dnd/browser/dnd";
import "monaco-editor/editor/contrib/find/browser/findController";
import "monaco-editor/editor/contrib/folding/browser/folding";
import "monaco-editor/editor/contrib/format/browser/formatActions";
import "monaco-editor/editor/contrib/gotoError/browser/gotoError";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution";
import "monaco-editor/editor/contrib/indentation/browser/indentation";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor";
import "monaco-editor/editor/contrib/smartSelect/browser/smartSelect";
import "monaco-editor/editor/contrib/snippet/browser/snippetController2";
import "monaco-editor/editor/contrib/suggest/browser/suggestController";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations";

export { jsonDefaults } from "monaco-editor/languages/features/json/register";
export { monaco };
