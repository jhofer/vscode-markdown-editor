import React, { useEffect, useRef } from "react";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import getDataTransferUris, {
  announcesDroppableUris,
} from "../editor/lib/getDataTransferUris";
import {
  DroppedResource,
  formatDroppedResource,
} from "../../common/droppedResources";

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onDropResources?: (uris: string[]) => Promise<DroppedResource[]>;
}

const vsCodeEditorTheme = EditorView.theme({
  "&": {
    fontFamily: "var(--vscode-editor-font-family)",
    fontSize: "var(--vscode-editor-font-size)",
    color: "var(--vscode-editor-foreground)",
    backgroundColor: "var(--vscode-editor-background)",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "var(--vscode-editorCursor-foreground)",
    fontFamily: "var(--vscode-editor-font-family)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--vscode-editorCursor-foreground)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--vscode-editor-selectionBackground)",
  },
  ".cm-panels": {
    backgroundColor: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-editorWidget-foreground)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--vscode-editorGutter-background, var(--vscode-editor-background))",
    color: "var(--vscode-editorLineNumber-foreground)",
    borderRight: "1px solid var(--vscode-editorGroup-border, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--vscode-editor-lineHighlightBackground, transparent)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--vscode-editor-lineHighlightBackground, transparent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--vscode-editor-findMatchHighlightBackground, #ea5c0055)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--vscode-editor-findMatchBackground, #ea5c00)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-editorWidget-foreground)",
    border: "1px solid var(--vscode-editorWidget-border)",
  },
});

export function CodeMirrorEditor({
  value,
  onChange,
  onDropResources,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Keep onChange in a ref so the updateListener always uses the latest version
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDropResourcesRef = useRef(onDropResources);
  onDropResourcesRef.current = onDropResources;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    // Dropping a file from VS Code inserts a link to it rather than its
    // contents; drops carrying anything else (dragged text) fall through to
    // CodeMirror's own handling.
    const dropHandler = EditorView.domEventHandlers({
      // Without accepting the drag here the drop never fires; see the same
      // handler in the rich editor's FileDrop plugin.
      dragover(event: DragEvent) {
        if (
          !onDropResourcesRef.current ||
          !announcesDroppableUris(event.dataTransfer)
        ) {
          return false;
        }

        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
        return false;
      },
      drop(event: DragEvent, view) {
        const resolve = onDropResourcesRef.current;
        if (!resolve || event.dataTransfer?.files?.length) return false;

        const uris = getDataTransferUris(event.dataTransfer);
        if (uris.length === 0) return false;

        event.preventDefault();
        const pos =
          view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
          view.state.selection.main.head;

        resolve(uris)
          .then((resources) => {
            const insert = resources.map(formatDroppedResource).join(" ");
            if (!insert) return;

            view.dispatch({
              changes: { from: pos, insert },
              selection: { anchor: pos + insert.length },
            });
            view.focus();
          })
          .catch((error) => {
            console.error("Failed to resolve dropped files", error);
          });

        return true;
      },
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        vsCodeEditorTheme,
        EditorView.lineWrapping,
        dropHandler,
        updateListener,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update editor content when value changes externally (e.g. from extension host).
  // Full replacement is intentional here: these updates come from outside the editor
  // (file changed on disk / switching modes) so preserving undo history is not desired.
  // Echo updates from the user's own edits are filtered in editorHost.tsx via pendingUpdateRef.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value ?? "" },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="codeMirrorRaw" />;
}
